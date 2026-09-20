// ---------------------------------------------------------------------------
// Alert route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to listen on a port.
//
// Three things only this file can prove: scoping, since a second account's
// rows have to exist to check they never appear; the existence checks
// createAlert runs before it writes; and the dedupe key, which only shows its
// effect once two real inserts collide in the database.
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
  await prisma.alert.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });

  await prisma.application.deleteMany({
    where: { opportunity: { title: { startsWith: TEST_PREFIX } } },
  });

  await prisma.opportunity.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });

  await prisma.contact.deleteMany({
    where: { firstName: { startsWith: TEST_PREFIX } },
  });

  await prisma.user.deleteMany({
    where: { username: { startsWith: OTHER_USER_PREFIX } },
  });
}

describe.skipIf(!email || !password)("alert routes", () => {
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

  const SOON = "2026-06-01T09:00:00.000Z";
  const LATER = "2026-09-01T09:00:00.000Z";

  async function testApplication(ownerId: string, label: string) {
    const opportunity = await prisma.opportunity.create({
      data: {
        title: testName(label),
        type: "INTERNSHIP",
        sourceUrl: "https://example.com/jobs/1",
      },
    });

    return prisma.application.create({
      data: { userId: ownerId, opportunityId: opportunity.id },
    });
  }

  function testContact(ownerId: string, label: string) {
    return prisma.contact.create({
      data: {
        firstName: testName(label),
        relationship: "RECRUITER",
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

  function testAlert(
    ownerId: string,
    label: string,
    overrides: { scheduledFor?: string; status?: "PENDING" | "SENT" } = {},
  ) {
    return prisma.alert.create({
      data: {
        userId: ownerId,
        type: "DEADLINE_REMINDER",
        title: testName(label),
        scheduledFor: new Date(overrides.scheduledFor ?? SOON),
        status: overrides.status ?? "PENDING",
        dedupeKey: randomUUID(),
      },
    });
  }

  function idsOf(body: { id: string }[]) {
    return body.map((alert) => alert.id);
  }

  describe("POST /alerts", () => {
    it("creates an alert and returns 201", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Created"),
        body: "The posting closes on Friday.",
        scheduledFor: SOON,
      });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe(testName("Created"));
      expect(response.body.body).toBe("The posting closes on Friday.");

      expect(response.body.scheduledFor).toBe(SOON);
    });

    it("starts a new alert at PENDING with nothing sent yet", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Pending"),
        scheduledFor: SOON,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("PENDING");
      expect(response.body.sentAt).toBeNull();
    });

    it("links the alert to an application", async () => {
      const application = await testApplication(userId, "Linked");

      const response = await post("/alerts", {
        type: "APPLICATION_FOLLOW_UP",
        title: testName("Chase"),
        scheduledFor: SOON,
        applicationId: application.id,
      });

      expect(response.status).toBe(201);
      expect(response.body.application.id).toBe(application.id);

      expect(response.body.application.opportunity.title).toBe(
        testName("Linked"),
      );
    });

    it("links the alert to a contact", async () => {
      const contact = await testContact(userId, "Recruiter");

      const response = await post("/alerts", {
        type: "CONTACT_FOLLOW_UP",
        title: testName("Reply"),
        scheduledFor: SOON,
        contactId: contact.id,
      });

      expect(response.status).toBe(201);
      expect(response.body.contact.id).toBe(contact.id);
      expect(response.body.contact.firstName).toBe(testName("Recruiter"));
    });

    it("saves the alert against the signed-in user, ignoring any userId sent", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Owned"),
        scheduledFor: SOON,
        userId: randomUUID(),
      });

      expect(response.status).toBe(201);

      const stored = await prisma.alert.findFirst({
        where: { title: testName("Owned") },
      });

      expect(stored?.userId).toBe(userId);
    });

    it("ignores a status and sentAt sent by the client", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Faked"),
        scheduledFor: SOON,
        status: "SENT",
        sentAt: "2026-01-01T00:00:00.000Z",
        banana: 7,
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("PENDING");
      expect(response.body.sentAt).toBeNull();
      expect(response.body.banana).toBeUndefined();
    });

    it("builds a dedupe key the client never sent", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Keyed"),
        scheduledFor: SOON,
        dedupeKey: "anything-i-like",
      });

      expect(response.status).toBe(201);

      const stored = await prisma.alert.findFirst({
        where: { title: testName("Keyed") },
      });

      expect(stored?.dedupeKey).not.toBe("anything-i-like");

      expect(stored?.dedupeKey).toContain(userId);
    });

    it("returns 400 when the title is missing", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        scheduledFor: SOON,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the scheduled date is missing", async () => {
      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("No Date"),
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the type is not one of the allowed values", async () => {
      const response = await post("/alerts", {
        type: "SOMETHING_ELSE",
        title: testName("Bad Type"),
        scheduledFor: SOON,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when an id is not a uuid", async () => {
      const response = await post("/alerts", {
        type: "APPLICATION_FOLLOW_UP",
        title: testName("Bad Id"),
        scheduledFor: SOON,
        applicationId: "not-a-uuid",
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when no application has that id", async () => {
      const response = await post("/alerts", {
        type: "APPLICATION_FOLLOW_UP",
        title: testName("Unknown Application"),
        scheduledFor: SOON,
        applicationId: randomUUID(),
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when no contact has that id", async () => {
      const response = await post("/alerts", {
        type: "CONTACT_FOLLOW_UP",
        title: testName("Unknown Contact"),
        scheduledFor: SOON,
        contactId: randomUUID(),
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the application belongs to another user", async () => {
      const other = await otherUser();
      const application = await testApplication(other.id, "Not Mine");

      const response = await post("/alerts", {
        type: "APPLICATION_FOLLOW_UP",
        title: testName("Stolen Application"),
        scheduledFor: SOON,
        applicationId: application.id,
      });

      expect(response.status).toBe(400);
    });

    it("returns 400 when the contact belongs to another user", async () => {
      const other = await otherUser();
      const contact = await testContact(other.id, "Not Mine");

      const response = await post("/alerts", {
        type: "CONTACT_FOLLOW_UP",
        title: testName("Stolen Contact"),
        scheduledFor: SOON,
        contactId: contact.id,
      });

      expect(response.status).toBe(400);
    });

    it("writes nothing when the contact belongs to another user", async () => {
      const other = await otherUser();
      const contact = await testContact(other.id, "Not Mine");

      await post("/alerts", {
        type: "CONTACT_FOLLOW_UP",
        title: testName("No Row Written"),
        scheduledFor: SOON,
        contactId: contact.id,
      });

      const count = await prisma.alert.count({
        where: { title: testName("No Row Written") },
      });

      expect(count).toBe(0);
    });
  });

  describe("POST /alerts deduplication", () => {
    function sameAlert(title: string) {
      return {
        type: "DEADLINE_REMINDER",
        title: testName(title),
        scheduledFor: SOON,
      };
    }

    it("returns 409 when the same alert is scheduled twice", async () => {
      const first = await post("/alerts", sameAlert("Twice"));
      expect(first.status).toBe(201);

      const second = await post("/alerts", sameAlert("Twice"));
      expect(second.status).toBe(409);
    });

    it("stores only one row when the same alert is scheduled twice", async () => {
      await post("/alerts", sameAlert("Once"));
      await post("/alerts", sameAlert("Once"));

      const count = await prisma.alert.count({
        where: { title: testName("Once") },
      });

      expect(count).toBe(1);
    });

    it("treats a reworded alert as the same reminder", async () => {
      const first = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Original Wording"),
        scheduledFor: SOON,
      });

      expect(first.status).toBe(201);

      const second = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Different Wording"),
        scheduledFor: SOON,
      });

      expect(second.status).toBe(409);
    });

    it("allows the same alert at a different time", async () => {
      const first = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Soon"),
        scheduledFor: SOON,
      });

      const second = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Later"),
        scheduledFor: LATER,
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });
    it("does not clash with an identical alert belonging to another user", async () => {
      const other = await otherUser();

      await prisma.alert.create({
        data: {
          userId: other.id,
          type: "DEADLINE_REMINDER",
          title: testName("Theirs"),
          scheduledFor: new Date(SOON),
          dedupeKey: [
            other.id,
            "DEADLINE_REMINDER",
            "none",
            "none",
            new Date(SOON).toISOString(),
          ].join("|"),
        },
      });

      const response = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Mine"),
        scheduledFor: SOON,
      });

      expect(response.status).toBe(201);
    });
  });

  describe("GET /alerts", () => {
    it("returns a list containing a created alert", async () => {
      const created = await testAlert(userId, "Listed");

      const response = await get("/alerts").query({ page: 1, limit: 50 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      expect(idsOf(response.body)).toContain(created.id);
    });

    it("does not return another user's alert", async () => {
      const other = await otherUser();
      const theirs = await testAlert(other.id, "Theirs");
      const mine = await testAlert(userId, "Mine");

      const response = await get("/alerts");

      expect(response.status).toBe(200);

      const ids = idsOf(response.body);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
    });

    it("leaves the message body and the dedupe key out of the list", async () => {
      const created = await prisma.alert.create({
        data: {
          userId,
          type: "DEADLINE_REMINDER",
          title: testName("Trimmed"),
          body: "A long message nobody needs in a list.",
          scheduledFor: new Date(SOON),
          dedupeKey: randomUUID(),
        },
      });

      const response = await get("/alerts");

      const listed = response.body.find(
        (alert: { id: string }) => alert.id === created.id,
      );

      expect(listed).toBeDefined();
      expect(listed.title).toBe(testName("Trimmed"));
      expect(listed.body).toBeUndefined();
      expect(listed.dedupeKey).toBeUndefined();
    });

    it("sorts by scheduled time, soonest first", async () => {
      const later = await testAlert(userId, "Later", { scheduledFor: LATER });
      const soon = await testAlert(userId, "Soon", { scheduledFor: SOON });

      const response = await get("/alerts");

      expect(response.status).toBe(200);

      const ids = idsOf(response.body).filter(
        (id) => id === soon.id || id === later.id,
      );

      expect(ids).toEqual([soon.id, later.id]);
    });

    it("returns at most limit alerts", async () => {
      await testAlert(userId, "One");
      await testAlert(userId, "Two");

      const response = await get("/alerts").query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
    });

    it("returns an empty list for a page past the end", async () => {
      await testAlert(userId, "Paged");

      const response = await get("/alerts").query({ limit: 1, page: 999 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe("GET /alerts filters", () => {
    it("filters by status", async () => {
      const pending = await testAlert(userId, "Pending");
      const sent = await testAlert(userId, "Sent", { status: "SENT" });

      const response = await get("/alerts").query({ status: "PENDING" });

      expect(response.status).toBe(200);

      const ids = idsOf(response.body);
      expect(ids).toContain(pending.id);
      expect(ids).not.toContain(sent.id);
    });

    it("filters by type", async () => {
      const contact = await testContact(userId, "Recruiter");

      const deadline = await testAlert(userId, "Deadline");

      const followUp = await prisma.alert.create({
        data: {
          userId,
          type: "CONTACT_FOLLOW_UP",
          title: testName("Follow Up"),
          scheduledFor: new Date(SOON),
          contactId: contact.id,
          dedupeKey: randomUUID(),
        },
      });

      const response = await get("/alerts").query({
        type: "CONTACT_FOLLOW_UP",
      });

      expect(response.status).toBe(200);

      const ids = idsOf(response.body);
      expect(ids).toContain(followUp.id);
      expect(ids).not.toContain(deadline.id);
    });

    it("filters by application", async () => {
      const application = await testApplication(userId, "Filtered");

      const attached = await prisma.alert.create({
        data: {
          userId,
          type: "APPLICATION_FOLLOW_UP",
          title: testName("Attached"),
          scheduledFor: new Date(SOON),
          applicationId: application.id,
          dedupeKey: randomUUID(),
        },
      });

      const loose = await testAlert(userId, "Loose");

      const response = await get("/alerts").query({
        applicationId: application.id,
      });

      expect(response.status).toBe(200);

      const ids = idsOf(response.body);
      expect(ids).toContain(attached.id);
      expect(ids).not.toContain(loose.id);
    });


    it("returns nothing when filtering by another user's application", async () => {
      const other = await otherUser();
      const application = await testApplication(other.id, "Not Mine");

      await prisma.alert.create({
        data: {
          userId: other.id,
          type: "APPLICATION_FOLLOW_UP",
          title: testName("Theirs"),
          scheduledFor: new Date(SOON),
          applicationId: application.id,
          dedupeKey: randomUUID(),
        },
      });

      const response = await get("/alerts").query({
        applicationId: application.id,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });


  describe("GET /alerts validation", () => {
    it("returns 400 when page is below 1", async () => {
      const response = await get("/alerts").query({ page: -5 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when limit is above the maximum", async () => {
      const response = await get("/alerts").query({ limit: 1000 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when status is not one of the allowed values", async () => {
      const response = await get("/alerts").query({ status: "MAYBE" });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /alerts/:id", () => {
    it("returns the alert when the id exists", async () => {
      const created = await prisma.alert.create({
        data: {
          userId,
          type: "DEADLINE_REMINDER",
          title: testName("Findable"),
          body: "The full message.",
          scheduledFor: new Date(SOON),
          dedupeKey: randomUUID(),
        },
      });

      const response = await get(`/alerts/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(testName("Findable"));

      expect(response.body.body).toBe("The full message.");
      expect(response.body.status).toBe("PENDING");
    });

    it("does not expose the dedupe key", async () => {
      const created = await testAlert(userId, "Private Key");

      const response = await get(`/alerts/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.dedupeKey).toBeUndefined();
    });


    it("returns 404 for another user's alert", async () => {
      const other = await otherUser();
      const theirs = await testAlert(other.id, "Theirs");

      const response = await get(`/alerts/${theirs.id}`);

      expect(response.status).toBe(404);
    });

    it("returns 404 when the id is a valid uuid but no alert has it", async () => {
      const response = await get(`/alerts/${randomUUID()}`);

      expect(response.status).toBe(404);
    });

    it("returns 400 when the id is not a uuid", async () => {
      const response = await get("/alerts/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /alerts/:id", () => {
    it("removes the alert and returns 204", async () => {
      const created = await testAlert(userId, "Removable");

      const response = await del(`/alerts/${created.id}`);

      expect(response.status).toBe(204);

      const after = await get(`/alerts/${created.id}`);
      expect(after.status).toBe(404);
    });

    it("leaves the application and the contact in place", async () => {
      const application = await testApplication(userId, "Kept");
      const contact = await testContact(userId, "Kept");

      const created = await prisma.alert.create({
        data: {
          userId,
          type: "APPLICATION_FOLLOW_UP",
          title: testName("Kept"),
          scheduledFor: new Date(SOON),
          applicationId: application.id,
          contactId: contact.id,
          dedupeKey: randomUUID(),
        },
      });

      await del(`/alerts/${created.id}`);

      const storedApplication = await prisma.application.findUnique({
        where: { id: application.id },
      });

      const storedContact = await prisma.contact.findUnique({
        where: { id: contact.id },
      });

      expect(storedApplication).not.toBeNull();
      expect(storedContact).not.toBeNull();
    });

    it("returns 404 for another user's alert and leaves it in place", async () => {
      const other = await otherUser();
      const theirs = await testAlert(other.id, "Theirs");

      const response = await del(`/alerts/${theirs.id}`);

      expect(response.status).toBe(404);

      const stored = await prisma.alert.findUnique({
        where: { id: theirs.id },
      });

      expect(stored).not.toBeNull();
    });

    it("returns 404 when the id is a valid uuid but no alert has it", async () => {
      const response = await del(`/alerts/${randomUUID()}`);

      expect(response.status).toBe(404);
    });

    it("returns 400 when the id is not a uuid", async () => {
      const response = await del("/alerts/not-a-uuid");

      expect(response.status).toBe(400);
    });

    // Deleting frees the dedupe key. Without this the unique index would turn
    // a delete into a permanent ban on that reminder ever existing again.
    it("lets the same alert be scheduled again after deletion", async () => {
      const first = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Recreate"),
        scheduledFor: SOON,
      });

      expect(first.status).toBe(201);

      const created = await prisma.alert.findFirst({
        where: { title: testName("Recreate") },
      });

      await del(`/alerts/${created!.id}`);

      const second = await post("/alerts", {
        type: "DEADLINE_REMINDER",
        title: testName("Recreate"),
        scheduledFor: SOON,
      });

      expect(second.status).toBe(201);
    });
  });

  describe("authentication", () => {
    it("returns 401 without a token", async () => {
      const response = await request(app).get("/alerts");

      expect(response.status).toBe(401);
    });

    it("returns 401 with a token that is not valid", async () => {
      const response = await request(app)
        .get("/alerts")
        .set("Authorization", "Bearer not-a-real-token");

      expect(response.status).toBe(401);
    });

    it("returns 401 when creating an alert without a token", async () => {
      const response = await request(app).post("/alerts").send({
        type: "DEADLINE_REMINDER",
        title: testName("No Token"),
        scheduledFor: SOON,
      });

      expect(response.status).toBe(401);
    });
  });
});
