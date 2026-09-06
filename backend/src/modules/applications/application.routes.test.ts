// ---------------------------------------------------------------------------
// Application route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to be listening on a port.
//
// application.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for.
//
// Two things only this file can prove. Scoping, since several tests below
// create a second account's rows and check they never appear or change. And the
// rules that live in the service rather than in the schema, such as
// statusChangedAt moving only when the status really moves.
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
// exactly the rows they create and nothing else. An application has no name of
// its own, so the prefix goes on the rows it points at: every opportunity,
// resume and contact made here carries it, and applications are found through
// their opportunity.
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

// Applications go first because they point at opportunities, resumes and
// contacts. Deleting a parent row while a child still references it is the
// ordering mistake that only shows up once a foreign key stops cascading, and
// Application.opportunityId is required, so Postgres refuses that outright.
async function deleteTestData() {
  await prisma.application.deleteMany({
    where: { opportunity: { title: { startsWith: TEST_PREFIX } } },
  });

  await prisma.opportunity.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });

  await prisma.resume.deleteMany({
    where: { label: { startsWith: TEST_PREFIX } },
  });

  await prisma.contact.deleteMany({
    where: { firstName: { startsWith: TEST_PREFIX } },
  });

  await prisma.user.deleteMany({
    where: { username: { startsWith: OTHER_USER_PREFIX } },
  });
}

describe.skipIf(!email || !password)("application routes", () => {
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

    // Application.userId is a foreign key into the User table, and nothing
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

  function patch(path: string, body: object) {
    return request(app)
      .patch(path)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function del(path: string) {
    return request(app).delete(path).set("Authorization", `Bearer ${token}`);
  }

  // -------------------------------------------------------------------------
  // Fixtures
  //
  // Everything an application points at is created straight through Prisma
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
  // stored file, so a row that merely looks like a resume is enough.
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

  function testContact(label: string, ownerId: string) {
    return prisma.contact.create({
      data: {
        firstName: testName(label),
        relationship: "REFERRAL",
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

  async function otherUsersApplication(opportunityId: string) {
    const other = await otherUser();

    return prisma.application.create({
      data: { userId: other.id, opportunityId },
    });
  }

  function idsOf(body: { id: string }[]) {
    return body.map((application) => application.id);
  }

  describe("POST /applications", () => {
    it("creates an application and returns 201", async () => {
      const opportunity = await testOpportunity("Created");

      const response = await post("/applications", {
        opportunityId: opportunity.id,
      });

      expect(response.status).toBe(201);
      expect(response.body.opportunityId).toBe(opportunity.id);

      // A generated id proves the row really reached the database.
      expect(response.body.id).toBeDefined();
    });

    // The database default, seen through a real request. The schema leaves
    // status out when the client does not send one, which is what lets
    // @default(SAVED) decide.
    it("starts a new application at SAVED when no status is sent", async () => {
      const opportunity = await testOpportunity("Default");

      const response = await post("/applications", {
        opportunityId: opportunity.id,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("SAVED");
    });

    it("accepts a status that is sent", async () => {
      const opportunity = await testOpportunity("Applied");

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        status: "APPLIED",
        appliedAt: "2026-03-01T12:00:00.000Z",
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("APPLIED");

      // JSON has no date type, so the response carries the ISO string back.
      expect(response.body.appliedAt).toBe("2026-03-01T12:00:00.000Z");
    });

    // The important one. Ownership comes from the verified token, never from
    // the request, so a client cannot file an application under someone else.
    it("saves the application against the signed-in user, ignoring any userId sent", async () => {
      const opportunity = await testOpportunity("Owned");

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        userId: randomUUID(),
      });

      expect(response.status).toBe(201);
      expect(response.body.userId).toBe(userId);
    });

    it("returns 400 when the opportunity is missing", async () => {
      const response = await post("/applications", { status: "SAVED" });

      expect(response.status).toBe(400);
    });

    it("returns 400 when status is not an allowed value", async () => {
      const opportunity = await testOpportunity("Bad Status");

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        status: "APPLYED",
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the id is not a uuid", async () => {
      const response = await post("/applications", {
        opportunityId: "not-a-uuid",
      });

      expect(response.status).toBe(400);
    });

    // A well formed id for a row that does not exist. Without the existence
    // check in the service this reaches Postgres, breaks the foreign key and
    // comes back as a 500 for what is really the client's mistake.
    it("returns 400 when no opportunity has that id", async () => {
      const response = await post("/applications", {
        opportunityId: randomUUID(),
      });

      expect(response.status).toBe(400);
    });

    it("links a resume and a referral contact of the signed-in user", async () => {
      const opportunity = await testOpportunity("Linked");
      const resume = await testResume("My Resume", userId);
      const contact = await testContact("My Referral", userId);

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
        referralContactId: contact.id,
      });

      expect(response.status).toBe(201);
      expect(response.body.resume.label).toBe(testName("My Resume"));
      expect(response.body.referralContact.firstName).toBe(
        testName("My Referral"),
      );
    });

    // The security case the guid check alone cannot cover. The id is real and
    // well formed, it just belongs to somebody else, so only a lookup filtered
    // by userId can catch it.
    it("returns 400 when the resume belongs to another user", async () => {
      const opportunity = await testOpportunity("Stolen Resume");
      const other = await otherUser();
      const resume = await testResume("Not Mine", other.id);

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        resumeId: resume.id,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the referral contact belongs to another user", async () => {
      const opportunity = await testOpportunity("Stolen Contact");
      const other = await otherUser();
      const contact = await testContact("Not Mine", other.id);

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        referralContactId: contact.id,
      });

      expect(response.status).toBe(400);
    });

    it("does not save fields that are not in the schema", async () => {
      const opportunity = await testOpportunity("Extra");

      const response = await post("/applications", {
        opportunityId: opportunity.id,
        banana: 7,
      });

      expect(response.status).toBe(201);
      expect(response.body.banana).toBeUndefined();
    });
  });

  describe("GET /applications", () => {
    it("returns a list containing a created application", async () => {
      const opportunity = await testOpportunity("Listed");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await get("/applications").query({ page: 1, limit: 50 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Checks that this specific application is present rather than checking
      // the array length, because other rows may exist in the database.
      expect(idsOf(response.body)).toContain(created.body.id);
    });

    // The whole reason listApplications takes a userId. Without that filter this
    // request would hand one user every other user's job search.
    it("does not return another user's application", async () => {
      const opportunity = await testOpportunity("Shared Posting");
      const theirs = await otherUsersApplication(opportunity.id);
      const mine = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await get("/applications").query({
        opportunityId: opportunity.id,
      });

      expect(response.status).toBe(200);

      const ids = idsOf(response.body);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(theirs.id);
    });

    // The list shows which posting each application is for, so the include in
    // the service is part of the contract and not just an implementation detail.
    it("includes the opportunity of each application", async () => {
      const opportunity = await testOpportunity("With Opportunity");
      await post("/applications", { opportunityId: opportunity.id });

      const response = await get("/applications").query({
        opportunityId: opportunity.id,
      });

      expect(response.status).toBe(200);
      expect(response.body[0].opportunity.title).toBe(
        testName("With Opportunity"),
      );
    });

    it("returns at most limit applications", async () => {
      const opportunity = await testOpportunity("Limit");
      await post("/applications", { opportunityId: opportunity.id });
      await post("/applications", { opportunityId: opportunity.id });

      const response = await get("/applications").query({
        opportunityId: opportunity.id,
        page: 1,
        limit: 1,
      });

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
    });

    it("returns an empty list for a page past the end", async () => {
      const opportunity = await testOpportunity("Paged");
      await post("/applications", { opportunityId: opportunity.id });

      const response = await get("/applications").query({
        opportunityId: opportunity.id,
        limit: 1,
        page: 99,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("filters by status", async () => {
      const opportunity = await testOpportunity("Filtered");

      const saved = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const interviewing = await post("/applications", {
        opportunityId: opportunity.id,
        status: "INTERVIEWING",
      });

      const response = await get("/applications").query({
        opportunityId: opportunity.id,
        status: "INTERVIEWING",
      });

      const ids = idsOf(response.body);
      expect(ids).toContain(interviewing.body.id);
      expect(ids).not.toContain(saved.body.id);
    });

    it("filters by opportunity", async () => {
      const wanted = await testOpportunity("Wanted");
      const other = await testOpportunity("Other");

      const mine = await post("/applications", { opportunityId: wanted.id });
      const unrelated = await post("/applications", {
        opportunityId: other.id,
      });

      const response = await get("/applications").query({
        opportunityId: wanted.id,
      });

      const ids = idsOf(response.body);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(unrelated.body.id);
    });

    // The list is about what you are actively working, so the most recently
    // moved application leads.
    //
    // Both rows are written with Prisma rather than posted, because
    // statusChangedAt is server-owned and cannot be set over HTTP. Naming the
    // two timestamps here is what makes the expected order certain, instead of
    // depending on two writes landing in the right order milliseconds apart.
    it("sorts by status change, most recent first", async () => {
      const opportunity = await testOpportunity("Ordered");

      const older = await prisma.application.create({
        data: {
          userId,
          opportunityId: opportunity.id,
          statusChangedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });

      const newer = await prisma.application.create({
        data: {
          userId,
          opportunityId: opportunity.id,
          statusChangedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      });

      const response = await get("/applications").query({
        opportunityId: opportunity.id,
      });

      expect(response.status).toBe(200);
      expect(idsOf(response.body)).toEqual([newer.id, older.id]);
    });
  });

  // A malformed query string is the client's mistake, so it has to come back as
  // 400. Without the schema, a negative page reaches Prisma and becomes a 500,
  // which reads in the logs like a server defect.
  describe("GET /applications validation", () => {
    it("returns 400 when page is below 1", async () => {
      const response = await get("/applications").query({ page: -5 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when limit is above the maximum", async () => {
      const response = await get("/applications").query({ limit: 1000 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when status is not an allowed value", async () => {
      const response = await get("/applications").query({ status: "APPLYED" });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /applications/:id", () => {
    it("returns the application when the id exists", async () => {
      const opportunity = await testOpportunity("Findable");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await get(`/applications/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.body.id);
      expect(response.body.opportunity.title).toBe(testName("Findable"));
    });

    // 404 rather than 403 on purpose. A 403 would confirm that the id belongs to
    // a real application, which is a way to map out other users' data one guess
    // at a time. From the client's side, someone else's application simply is
    // not there.
    it("returns 404 for another user's application", async () => {
      const opportunity = await testOpportunity("Not Mine");
      const theirs = await otherUsersApplication(opportunity.id);

      const response = await get(`/applications/${theirs.id}`);

      expect(response.status).toBe(404);
    });

    it("returns 404 when the id is a valid uuid but no application has it", async () => {
      const response = await get(`/applications/${randomUUID()}`);

      expect(response.status).toBe(404);
    });

    // This is what applicationIdRules buys. Postgres rejects a non uuid string
    // as a type error, so without the check this comes back as a 500.
    it("returns 400 when the id is not a uuid", async () => {
      const response = await get("/applications/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /applications/:id", () => {
    it("updates the status and returns 200", async () => {
      const opportunity = await testOpportunity("Movable");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await patch(`/applications/${created.body.id}`, {
        status: "INTERVIEWING",
      });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("INTERVIEWING");
    });

    // statusChangedAt is what the follow-up alerts will measure, so it has to
    // move when the status moves.
    //
    // Asserting "different" rather than "later" on purpose. The database writes
    // the first value with its own clock and the service writes the second with
    // the machine running the test, and those two clocks are not guaranteed to
    // agree closely enough for a comparison to be safe.
    it("moves statusChangedAt when the status changes", async () => {
      const opportunity = await testOpportunity("Moved");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await patch(`/applications/${created.body.id}`, {
        status: "APPLIED",
      });

      expect(response.status).toBe(200);
      expect(response.body.statusChangedAt).not.toBe(
        created.body.statusChangedAt,
      );
    });

    // The other half of the rule, and the reason the service reads the row
    // before writing it. Editing a note must not make a stale application look
    // freshly moved.
    it("leaves statusChangedAt alone when only the notes change", async () => {
      const opportunity = await testOpportunity("Noted");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await patch(`/applications/${created.body.id}`, {
        notes: "Followed up by email.",
      });

      expect(response.status).toBe(200);
      expect(response.body.notes).toBe("Followed up by email.");
      expect(response.body.statusChangedAt).toBe(created.body.statusChangedAt);
    });

    it("leaves statusChangedAt alone when the status is resent unchanged", async () => {
      const opportunity = await testOpportunity("Resent");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await patch(`/applications/${created.body.id}`, {
        status: "SAVED",
      });

      expect(response.status).toBe(200);
      expect(response.body.statusChangedAt).toBe(created.body.statusChangedAt);
    });

    // null is the client asking to empty a column, which is different from
    // leaving the field out. Without .nullable() in the schema there would be no
    // way to undo a note.
    it("clears the notes when null is sent", async () => {
      const opportunity = await testOpportunity("Cleared");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
        notes: "Something to erase.",
      });

      const response = await patch(`/applications/${created.body.id}`, {
        notes: null,
      });

      expect(response.status).toBe(200);
      expect(response.body.notes).toBeNull();
    });

    // An application pointed at a different posting is a different application,
    // so the field is dropped by the schema rather than written.
    it("ignores an opportunityId sent in the body", async () => {
      const opportunity = await testOpportunity("Kept");
      const elsewhere = await testOpportunity("Elsewhere");

      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await patch(`/applications/${created.body.id}`, {
        status: "APPLIED",
        opportunityId: elsewhere.id,
      });

      expect(response.status).toBe(200);
      expect(response.body.opportunityId).toBe(opportunity.id);
    });

    // The write version of the scoping test. A 404 alone would not prove much,
    // so the row is read back afterwards to show nothing was changed.
    it("returns 404 for another user's application and leaves it untouched", async () => {
      const opportunity = await testOpportunity("Not Mine");
      const theirs = await otherUsersApplication(opportunity.id);

      const response = await patch(`/applications/${theirs.id}`, {
        status: "REJECTED",
      });

      expect(response.status).toBe(404);

      const stored = await prisma.application.findUnique({
        where: { id: theirs.id },
      });

      expect(stored?.status).toBe("SAVED");
    });

    it("returns 404 when the id is a valid uuid but no application has it", async () => {
      const response = await patch(`/applications/${randomUUID()}`, {
        status: "APPLIED",
      });

      expect(response.status).toBe(404);
    });

    it("returns 400 when the id is not a uuid", async () => {
      const response = await patch("/applications/not-a-uuid", {
        status: "APPLIED",
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when status is not an allowed value", async () => {
      const opportunity = await testOpportunity("Bad Patch");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await patch(`/applications/${created.body.id}`, {
        status: "APPLYED",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /applications/:id", () => {
    it("removes the application and returns 204", async () => {
      const opportunity = await testOpportunity("Removable");
      const created = await post("/applications", {
        opportunityId: opportunity.id,
      });

      const response = await del(`/applications/${created.body.id}`);

      expect(response.status).toBe(204);

      // 204 means there is no body to check, so the proof is that the row can
      // no longer be read back.
      const after = await get(`/applications/${created.body.id}`);
      expect(after.status).toBe(404);
    });

    // The one that matters. deleteMany filters by userId inside the query, so a
    // guessed id matches nothing rather than deleting somebody else's row.
    it("returns 404 for another user's application and leaves it in place", async () => {
      const opportunity = await testOpportunity("Not Mine");
      const theirs = await otherUsersApplication(opportunity.id);

      const response = await del(`/applications/${theirs.id}`);

      expect(response.status).toBe(404);

      const stored = await prisma.application.findUnique({
        where: { id: theirs.id },
      });

      expect(stored).not.toBeNull();
    });

    it("returns 404 when the id is a valid uuid but no application has it", async () => {
      const response = await del(`/applications/${randomUUID()}`);

      expect(response.status).toBe(404);
    });

    it("returns 400 when the id is not a uuid", async () => {
      const response = await del("/applications/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });
});
