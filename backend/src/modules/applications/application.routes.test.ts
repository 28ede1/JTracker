// ---------------------------------------------------------------------------
// Application route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to listen on a port.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

const TEST_PREFIX = "Test ";

const OTHER_USER_PREFIX = "test-other-";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

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
  let token = "";
  let userId = "";

  beforeAll(async () => {
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    );

    const { data, error } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });

    if (error) {
      throw new Error(`Could not sign in as TEST_USER_EMAIL: ${error.message}`);
    }

    token = data.session!.access_token;
    userId = data.user!.id;

    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, username: `test-user-${userId.slice(0, 8)}` },
      update: {},
    });

    await deleteTestData();
  });

  afterEach(deleteTestData);

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

  function testOpportunity(label: string) {
    return prisma.opportunity.create({
      data: {
        title: testName(label),
        type: "INTERNSHIP",
        sourceUrl: "https://example.com/jobs/1",
      },
    });
  }

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

      expect(response.body.id).toBeDefined();
    });

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

      expect(response.body.appliedAt).toBe("2026-03-01T12:00:00.000Z");
    });

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


      expect(idsOf(response.body)).toContain(created.body.id);
    });

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

      const after = await get(`/applications/${created.body.id}`);
      expect(after.status).toBe(404);
    });

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
