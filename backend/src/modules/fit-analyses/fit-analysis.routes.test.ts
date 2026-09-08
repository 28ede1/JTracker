// ---------------------------------------------------------------------------
// Fit Analysis route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to be listening on a port.
//
// fit-analysis.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for.
//
// Two things only this file can prove. Scoping, since several tests below
// create a second account's rows and check they never appear or change. And the
// rules that live in the service rather than in the schema, above all the
// existence checks createFitAnalysis runs before it writes: an opportunity has
// to exist, and a resume has to exist and belong to the person asking.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

// ---------------------------------------------------------------------------
// Credentials
//
// Every route in this file sits behind requireAuth, so there is nothing to test
// without a real signed-in user. When the two variables are missing the whole
// file skips instead of failing, so a fresh clone still runs green.
// See .env.example.
// ---------------------------------------------------------------------------

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

// ---------------------------------------------------------------------------
// Cleanup
//
// These tests run against the development database, so they have to remove
// exactly the rows they create and nothing else. A fit analysis has no name of
// its own, so the prefix goes on the rows it points at: every opportunity and
// resume made here carries it, and fit analyses are found through their
// opportunity.
//
// Deleting by prefix instead of by recorded id matters for two reasons. A test
// that fails before it can record an id still gets cleaned up, and rows left
// behind by a run that was interrupted partway through get swept on the next
// start instead of piling up.
// ---------------------------------------------------------------------------

const TEST_PREFIX = "Test ";

// The stand-in second account gets its own prefix so cleanup can delete it
// without touching the real test user, whose row has to survive between runs.
const OTHER_USER_PREFIX = "test-other-";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

// Fit analyses go first because they point at opportunities and resumes.
// Deleting a parent row while a child still references it is the ordering
// mistake that only shows up once a foreign key stops cascading, and both
// FitAnalysis.opportunityId and FitAnalysis.resumeId are required.
//
// Applications are swept too, even though nothing in this file creates one.
// application.routes.test.ts marks its opportunities with the same "Test "
// prefix in the same shared database, and Application.opportunityId is declared
// ON DELETE RESTRICT, so Postgres refuses to remove an opportunity while any
// application still points at it. One row left behind by an interrupted run
// would otherwise make the delete below throw inside beforeAll and fail every
// test in this file at once.
async function deleteTestData() {
  await prisma.fitAnalysis.deleteMany({
    where: { opportunity: { title: { startsWith: TEST_PREFIX } } },
  });

  await prisma.application.deleteMany({
    where: { opportunity: { title: { startsWith: TEST_PREFIX } } },
  });

  await prisma.opportunity.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });

  await prisma.resume.deleteMany({
    where: { label: { startsWith: TEST_PREFIX } },
  });

  await prisma.user.deleteMany({
    where: { username: { startsWith: OTHER_USER_PREFIX } },
  });
}

describe.skipIf(!email || !password)("fit analysis routes", () => {
  // Filled in by beforeAll. The helpers below read them at call time, so they
  // are still empty when this file is first evaluated and that is fine.
  let token = "";
  let userId = "";

  beforeAll(async () => {
    // A client of its own rather than the shared one from lib/supabase.ts. That
    // client belongs to the server and should never hold one person's session.
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    );

    const { data, error } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });

    // A wrong password here is a broken test setup, not a failing feature, so
    // it stops the run immediately instead of failing every test below.
    if (error) {
      throw new Error(`Could not sign in as TEST_USER_EMAIL: ${error.message}`);
    }

    token = data.session!.access_token;
    userId = data.user!.id;

    // FitAnalysis.userId is a foreign key into the User table, and nothing
    // writes that row yet, because sign-up only creates the Supabase auth user.
    // Until provisioning exists the test makes the row itself. Delete this block
    // the day sign-up starts doing it.
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, username: `test-user-${userId.slice(0, 8)}` },
      update: {},
    });

    // Clears strays from any earlier run that ended before it could clean up.
    await deleteTestData();
  });

  // Stops each test from seeing rows created by the test before it.
  afterEach(deleteTestData);

  // -------------------------------------------------------------------------
  // Request helpers
  //
  // Every request needs the same header, so it lives in one place instead of
  // being repeated on forty lines. Forgetting it on one test would turn a real
  // failure into a confusing 401.
  // -------------------------------------------------------------------------

  function get(path: string) {
    return request(app).get(path).set("Authorization", `Bearer ${token}`);
  }

  function post(path: string, body: object) {
    return request(app)
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function del(path: string) {
    return request(app).delete(path).set("Authorization", `Bearer ${token}`);
  }

  // -------------------------------------------------------------------------
  // Fixtures
  //
  // Everything a fit analysis points at is created straight through Prisma
  // rather than over HTTP. Those endpoints are not what this file tests, so a
  // bug in one of them should not turn up as a failure here.
  // -------------------------------------------------------------------------

  function testOpportunity(label: string) {
    return prisma.opportunity.create({
      data: {
        title: testName(label),
        type: "INTERNSHIP",
        sourceUrl: "https://example.com/jobs/1",
      },
    });
  }

  // filePath is invented rather than uploaded. Nothing in this module reads the
  // stored file, so a row that merely looks like a resume is enough. The real
  // upload path is covered by resume.routes.test.ts.
  function testResume(label: string, ownerId: string) {
    return prisma.resume.create({
      data: {
        label: testName(label),
        filePath: `${ownerId}/${randomUUID()}.pdf`,
        fileType: "PDF",
        fileSize: 1024,
        userId: ownerId,
      },
    });
  }

  // Stands in for a second person using the app. Built straight through Prisma
  // because there is no way to create another user over HTTP, and the point is
  // to prove the scoping in the service rather than to test sign-up.
  function otherUser() {
    return prisma.user.create({
      data: {
        id: randomUUID(),
        username: `${OTHER_USER_PREFIX}${randomUUID().slice(0, 8)}`,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Why rows are created with Prisma when a test needs an id
  //
  // The service selects a fixed set of columns for a single analysis, and id is
  // not among them, so the body of a 201 or of GET /:id has no id to read back.
  // Any test that then has to address that row by id creates it with Prisma
  // instead, where the whole row comes back. Writing the tests this way means
  // they keep passing unchanged if id is later added to that selection.
  // -------------------------------------------------------------------------

  function testFitAnalysis(opportunityId: string, resumeId: string) {
    return prisma.fitAnalysis.create({
      data: { userId, opportunityId, resumeId },
    });
  }

  // A complete second account: the user, a resume of their own, and an analysis
  // tying them to the given posting. Opportunities are shared reference data, so
  // the two accounts can point at the same one, which is exactly the case the
  // scoping tests need.
  async function otherUsersFitAnalysis(opportunityId: string) {
    const other = await otherUser();
    const resume = await testResume("Their Resume", other.id);

    return prisma.fitAnalysis.create({
      data: { userId: other.id, opportunityId, resumeId: resume.id },
    });
  }

  function idsOf(body: { id: string }[]) {
    return body.map((fitAnalysis) => fitAnalysis.id);
  }

  describe("POST /fit-analyses", () => {
    it("creates a fit analysis and returns 201", async () => {
      const opportunity = await testOpportunity("Created");
      const resume = await testResume("Created", userId);

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
      });

      expect(response.status).toBe(201);

      // The response carries the two rows it was built from, so this also shows
      // the analysis is pointed where it was asked to be.
      expect(response.body.opportunity.title).toBe(testName("Created"));
      expect(response.body.resume.label).toBe(testName("Created"));
    });

    // The database defaults, seen through a real request. Creating an analysis
    // only queues the work: the AI step has not run yet, so the row starts empty
    // apart from its status. Getting this wrong would mean the UI showing a
    // score of 0 for work that has not happened.
    it("starts a new analysis at PENDING with no results yet", async () => {
      const opportunity = await testOpportunity("Pending");
      const resume = await testResume("Pending", userId);

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("PENDING");
      expect(response.body.score).toBeNull();
      expect(response.body.summary).toBeNull();
      expect(response.body.model).toBeNull();

      // A Postgres text array with no default starts empty rather than null.
      expect(response.body.strengths).toEqual([]);
      expect(response.body.gaps).toEqual([]);
    });

    // The important one. Ownership comes from the verified token, never from the
    // request, so a client cannot file an analysis under someone else. The
    // response does not include userId, so the stored row is read back directly.
    it("saves the analysis against the signed-in user, ignoring any userId sent", async () => {
      const opportunity = await testOpportunity("Owned");
      const resume = await testResume("Owned", userId);

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
        userId: randomUUID(),
      });

      expect(response.status).toBe(201);

      const stored = await prisma.fitAnalysis.findFirst({
        where: { opportunityId: opportunity.id },
      });

      expect(stored?.userId).toBe(userId);
    });

    // The end-to-end version of the "strips the fields the AI step owns" rule.
    // A client that sends a finished-looking analysis still gets a blank pending
    // one, because those keys never survive validation.
    it("ignores results sent by the client", async () => {
      const opportunity = await testOpportunity("Faked");
      const resume = await testResume("Faked", userId);

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
        status: "COMPLETED",
        score: 100,
        summary: "A perfect match.",
        banana: 7,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("PENDING");
      expect(response.body.score).toBeNull();
      expect(response.body.summary).toBeNull();
      expect(response.body.banana).toBeUndefined();
    });

    it("returns 400 when the resume is missing", async () => {
      const opportunity = await testOpportunity("No Resume");

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the opportunity is missing", async () => {
      const resume = await testResume("No Opportunity", userId);

      const response = await post("/fit-analyses", { resumeId: resume.id });

      expect(response.status).toBe(400);
    });

    it("returns 400 when an id is not a uuid", async () => {
      const response = await post("/fit-analyses", {
        opportunityId: "not-a-uuid",
        resumeId: "not-a-uuid",
      });

      expect(response.status).toBe(400);
    });

    // A well formed id for a row that does not exist. Without the existence
    // check in the service this reaches Postgres, breaks the foreign key and
    // comes back as a 500 for what is really the client's mistake.
    it("returns 400 when no opportunity has that id", async () => {
      const resume = await testResume("Unknown Opportunity", userId);

      const response = await post("/fit-analyses", {
        opportunityId: randomUUID(),
        resumeId: resume.id,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when no resume has that id", async () => {
      const opportunity = await testOpportunity("Unknown Resume");

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: randomUUID(),
      });

      expect(response.status).toBe(400);
    });

    // The security case the guid check alone cannot cover. The id is real and
    // well formed, it just belongs to somebody else, so only a lookup filtered
    // by userId can catch it. A miss here would let one person run an analysis
    // against another person's resume, and the summary that comes back would
    // describe its contents.
    it("returns 400 when the resume belongs to another user", async () => {
      const opportunity = await testOpportunity("Stolen Resume");
      const other = await otherUser();
      const resume = await testResume("Not Mine", other.id);

      const response = await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
      });

      expect(response.status).toBe(400);
    });

    // The status code alone would not prove much, so this checks that the
    // refusal happened before anything was written.
    it("writes nothing when the resume belongs to another user", async () => {
      const opportunity = await testOpportunity("No Row Written");
      const other = await otherUser();
      const resume = await testResume("Not Mine", other.id);

      await post("/fit-analyses", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
      });

      const count = await prisma.fitAnalysis.count({
        where: { opportunityId: opportunity.id },
      });

      expect(count).toBe(0);
    });
  });

  describe("GET /fit-analyses", () => {
    it("returns a list containing a created analysis", async () => {
      const opportunity = await testOpportunity("Listed");
      const resume = await testResume("Listed", userId);
      const created = await testFitAnalysis(opportunity.id, resume.id);

      const response = await get("/fit-analyses").query({ page: 1, limit: 50 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Checks that this specific analysis is present rather than checking the
      // array length, because other rows may exist in the database.
      expect(idsOf(response.body)).toContain(created.id);
    });

    // The whole reason listFitAnalyses takes a userId. Without that filter this
    // request would hand one user every other user's results.
    it("does not return another user's analysis", async () => {
      const opportunity = await testOpportunity("Shared Posting");
      const resume = await testResume("Mine", userId);

      const theirs = await otherUsersFitAnalysis(opportunity.id);
      const mine = await testFitAnalysis(opportunity.id, resume.id);

      const response = await get("/fit-analyses");

      expect(response.status).toBe(200);

      const ids = idsOf(response.body);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
    });

    // The list shows which posting each analysis is for, so the include in the
    // service is part of the contract and not just an implementation detail.
    it("includes the opportunity of each analysis", async () => {
      const opportunity = await testOpportunity("With Opportunity");
      const resume = await testResume("With Opportunity", userId);
      const created = await testFitAnalysis(opportunity.id, resume.id);

      const response = await get("/fit-analyses");

      expect(response.status).toBe(200);

      const listed = response.body.find(
        (fitAnalysis: { id: string }) => fitAnalysis.id === created.id,
      );

      expect(listed.opportunity.title).toBe(testName("With Opportunity"));
    });

    it("returns at most limit analyses", async () => {
      const opportunity = await testOpportunity("Limit");
      const resume = await testResume("Limit", userId);

      await testFitAnalysis(opportunity.id, resume.id);
      await testFitAnalysis(opportunity.id, resume.id);

      const response = await get("/fit-analyses").query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
    });

    it("returns an empty list for a page past the end", async () => {
      const opportunity = await testOpportunity("Paged");
      const resume = await testResume("Paged", userId);
      await testFitAnalysis(opportunity.id, resume.id);

      const response = await get("/fit-analyses").query({
        limit: 1,
        page: 999,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    // Newest first, because the list is about what you just ran.
    //
    // The two rows are written with Prisma so their createdAt values can be
    // named outright, rather than depending on two writes landing in the right
    // order milliseconds apart. The assertion then filters the response down to
    // these two ids before comparing, so an unrelated row belonging to the test
    // user cannot break it.
    it("sorts by creation time, most recent first", async () => {
      const opportunity = await testOpportunity("Ordered");
      const resume = await testResume("Ordered", userId);

      const older = await prisma.fitAnalysis.create({
        data: {
          userId,
          opportunityId: opportunity.id,
          resumeId: resume.id,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });

      const newer = await prisma.fitAnalysis.create({
        data: {
          userId,
          opportunityId: opportunity.id,
          resumeId: resume.id,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      });

      const response = await get("/fit-analyses");

      expect(response.status).toBe(200);

      const ids = idsOf(response.body).filter(
        (id) => id === older.id || id === newer.id,
      );

      expect(ids).toEqual([newer.id, older.id]);
    });
  });

  // A malformed query string is the client's mistake, so it has to come back as
  // 400. Without the schema, a negative page reaches Prisma and becomes a 500,
  // which reads in the logs like a server defect.
  describe("GET /fit-analyses validation", () => {
    it("returns 400 when page is below 1", async () => {
      const response = await get("/fit-analyses").query({ page: -5 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when limit is above the maximum", async () => {
      const response = await get("/fit-analyses").query({ limit: 1000 });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /fit-analyses/:id", () => {
    it("returns the analysis when the id exists", async () => {
      const opportunity = await testOpportunity("Findable");
      const resume = await testResume("Findable", userId);
      const created = await testFitAnalysis(opportunity.id, resume.id);

      const response = await get(`/fit-analyses/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("PENDING");

      // The detail view is where you compare one resume against one posting, so
      // both sides have to come back with it.
      expect(response.body.opportunity.title).toBe(testName("Findable"));
      expect(response.body.resume.label).toBe(testName("Findable"));
    });

    // 404 rather than 403 on purpose. A 403 would confirm that the id belongs to
    // a real analysis, which is a way to map out other users' data one guess at
    // a time. From the client's side, someone else's analysis simply is not
    // there.
    it("returns 404 for another user's analysis", async () => {
      const opportunity = await testOpportunity("Not Mine");
      const theirs = await otherUsersFitAnalysis(opportunity.id);

      const response = await get(`/fit-analyses/${theirs.id}`);

      expect(response.status).toBe(404);
    });

    it("returns 404 when the id is a valid uuid but no analysis has it", async () => {
      const response = await get(`/fit-analyses/${randomUUID()}`);

      expect(response.status).toBe(404);
    });

    // This is what fitAnalysisIdRules buys. Postgres rejects a non uuid string
    // as a type error, so without the check this comes back as a 500.
    it("returns 400 when the id is not a uuid", async () => {
      const response = await get("/fit-analyses/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /fit-analyses/:id", () => {
    it("removes the analysis and returns 204", async () => {
      const opportunity = await testOpportunity("Removable");
      const resume = await testResume("Removable", userId);
      const created = await testFitAnalysis(opportunity.id, resume.id);

      const response = await del(`/fit-analyses/${created.id}`);

      expect(response.status).toBe(204);

      // 204 means there is no body to check, so the proof is that the row can no
      // longer be read back.
      const after = await get(`/fit-analyses/${created.id}`);
      expect(after.status).toBe(404);
    });

    // Deleting an analysis must not take the resume or the posting with it. The
    // cascade in the schema runs the other way, from parent to child, and this
    // is the test that would catch it being written backwards.
    it("leaves the resume and the opportunity in place", async () => {
      const opportunity = await testOpportunity("Kept");
      const resume = await testResume("Kept", userId);
      const created = await testFitAnalysis(opportunity.id, resume.id);

      await del(`/fit-analyses/${created.id}`);

      const storedResume = await prisma.resume.findUnique({
        where: { id: resume.id },
      });

      const storedOpportunity = await prisma.opportunity.findUnique({
        where: { id: opportunity.id },
      });

      expect(storedResume).not.toBeNull();
      expect(storedOpportunity).not.toBeNull();
    });

    // The one that matters. deleteMany filters by userId inside the query, so a
    // guessed id matches nothing rather than deleting somebody else's row.
    it("returns 404 for another user's analysis and leaves it in place", async () => {
      const opportunity = await testOpportunity("Not Mine");
      const theirs = await otherUsersFitAnalysis(opportunity.id);

      const response = await del(`/fit-analyses/${theirs.id}`);

      expect(response.status).toBe(404);

      const stored = await prisma.fitAnalysis.findUnique({
        where: { id: theirs.id },
      });

      expect(stored).not.toBeNull();
    });

    it("returns 404 when the id is a valid uuid but no analysis has it", async () => {
      const response = await del(`/fit-analyses/${randomUUID()}`);

      expect(response.status).toBe(404);
    });

    it("returns 400 when the id is not a uuid", async () => {
      const response = await del("/fit-analyses/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });
});
