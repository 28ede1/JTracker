// ---------------------------------------------------------------------------
// Fit Analysis route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to listen on a port.
//
// Two things only this file can prove: scoping, since a second account's rows
// have to exist to check they never appear or change; and the existence checks
// createFitAnalysis runs before it writes, where an opportunity has to exist
// and a resume has to exist and belong to the person asking.
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

  function otherUser() {
    return prisma.user.create({
      data: {
        id: randomUUID(),
        username: `${OTHER_USER_PREFIX}${randomUUID().slice(0, 8)}`,
      },
    });
  }

  function testFitAnalysis(opportunityId: string, resumeId: string) {
    return prisma.fitAnalysis.create({
      data: { userId, opportunityId, resumeId },
    });
  }

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

      expect(response.body.opportunity.title).toBe(testName("Created"));
      expect(response.body.resume.label).toBe(testName("Created"));
    });

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

      expect(response.body.strengths).toEqual([]);
      expect(response.body.gaps).toEqual([]);
    });

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

      expect(idsOf(response.body)).toContain(created.id);
    });

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

      expect(response.body.opportunity.title).toBe(testName("Findable"));
      expect(response.body.resume.label).toBe(testName("Findable"));
    });

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

      const after = await get(`/fit-analyses/${created.id}`);
      expect(after.status).toBe(404);
    });

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
