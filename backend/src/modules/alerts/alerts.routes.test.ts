// ---------------------------------------------------------------------------
// Alert route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to be listening on a port.
//
// alerts.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for.
//
// Three things only this file can prove. Scoping, since several tests below
// create a second account's rows and check they never appear or change. The
// existence checks createAlert runs before it writes, which need real rows to
// look up. And the dedupe key, which is invented inside the service and only
// shows its effect once two real inserts collide in the database.
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
// exactly the rows they create and nothing else. Unlike an application, an
// alert has a name of its own, so the prefix goes straight on its title and the
// sweep can find it directly.
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

// Alerts go first because they point at applications and contacts. Deleting a
// parent row while a child still references it is the ordering mistake that
// only shows up once a foreign key stops cascading.
//
// Applications are swept before opportunities for a harder reason.
// Application.opportunityId is declared ON DELETE RESTRICT, so Postgres refuses
// to remove an opportunity while any application still points at it. One row
// left behind by an interrupted run would otherwise make the delete below throw
// inside beforeAll and fail every test in this file at once.
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

    // Alert.userId is a foreign key into the User table, and nothing writes
    // that row yet, because sign-up only creates the Supabase auth user. Until
    // provisioning exists the test makes the row itself. Delete this block the
    // day sign-up starts doing it.
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
  // Everything an alert points at is created straight through Prisma rather
  // than over HTTP. Those endpoints are not what this file tests, so a bug in
  // one of them should not turn up as a failure here.
  // -------------------------------------------------------------------------

  // Two alerts are only "the same reminder" when they share a scheduled time,
  // so the tests name their instants outright rather than using new Date().
  // Fixed values also mean the ordering test cannot depend on two writes
  // landing in the right order milliseconds apart.
  const SOON = "2026-06-01T09:00:00.000Z";
  const LATER = "2026-09-01T09:00:00.000Z";

  // An application needs an opportunity, so this makes both. Only the
  // opportunity carries the test prefix, because that is what the cleanup
  // sweep looks for.
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
  // Writing the row directly is also the only way to set dedupeKey by hand,
  // and the unique index means every fixture below needs its own. randomUUID
  // is right here precisely because it is not the real key: these rows exist to
  // be listed, read and deleted, not to test deduplication. The tests that do
  // test it go through the route, so the service builds the real key.
  // -------------------------------------------------------------------------
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

      // Dates come back over JSON as strings, so this compares the spelling
      // rather than a Date object.
      expect(response.body.scheduledFor).toBe(SOON);
    });

    // The database defaults, seen through a real request. Creating an alert
    // only queues it: nothing has been emailed yet, so a status of anything but
    // PENDING here would mean the sending job skips it forever.
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

      // The response nests the posting the application is for, so the reminder
      // reads as "follow up on this job" rather than as a bare id.
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

    // The important one. Ownership comes from the verified token, never from
    // the request, so a client cannot file an alert under someone else. The
    // response does not include userId, so the stored row is read back directly.
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

    // The end-to-end version of the "strips the fields the server owns" rule. A
    // client that sends an already-sent-looking alert still gets a pending one,
    // because those keys never survive validation.
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

    // dedupeKey is a required column with a unique index, and the client never
    // sends it, so this proves the service invents one on every insert. Without
    // it, the very first POST would fail on a null constraint.
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

      // The key is built from who, what kind, what it points at, and when, so
      // the signed-in user's id has to be part of it.
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

    // A well formed id for a row that does not exist. Without the existence
    // check in the service this reaches Postgres, breaks the foreign key and
    // comes back as a 500 for what is really the client's mistake.
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

    // The security case the guid check alone cannot cover. The id is real and
    // well formed, it just belongs to somebody else, so only a lookup filtered
    // by userId can catch it. A miss here would let one person hang a reminder
    // off another person's application, and every read of that alert would then
    // hand back the job title and status attached to it.
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

    // The status code alone would not prove much, so this checks that the
    // refusal happened before anything was written.
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

  // -------------------------------------------------------------------------
  // Deduplication
  //
  // The reason Alert.dedupeKey exists. Scheduling the same reminder twice must
  // not produce two emails, so the second attempt is refused rather than
  // stored. These go through the route on both attempts, because the key is
  // built inside the service and writing one by hand would test nothing.
  // -------------------------------------------------------------------------
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

    // The title is deliberately not part of the key. Rewording a reminder is
    // still the same reminder, so a second POST that only changes the wording
    // must not slip past as a new alert.
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

    // The other side of the same rule. A reminder due at a different time is a
    // different reminder, so the key has to include the scheduled instant.
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

    it("allows the same time for two different applications", async () => {
      const one = await testApplication(userId, "First");
      const two = await testApplication(userId, "Second");

      const first = await post("/alerts", {
        type: "APPLICATION_FOLLOW_UP",
        title: testName("Chase One"),
        scheduledFor: SOON,
        applicationId: one.id,
      });

      const second = await post("/alerts", {
        type: "APPLICATION_FOLLOW_UP",
        title: testName("Chase Two"),
        scheduledFor: SOON,
        applicationId: two.id,
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    // The index is unique across the whole table rather than per user, so the
    // key has to carry the owner's id. Without it, the first person to schedule
    // a reminder for a given moment would block everyone else from scheduling
    // one, and they would see a 409 for a row they cannot even see.
    it("does not clash with an identical alert belonging to another user", async () => {
      const other = await otherUser();

      // Built with Prisma rather than over HTTP, because there is no way to
      // sign in as the second account. The key is spelled out by hand in the
      // same shape the service builds, so this really is the colliding row.
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

      // Checks that this specific alert is present rather than checking the
      // array length, because other rows may exist in the database.
      expect(idsOf(response.body)).toContain(created.id);
    });

    // The whole reason listAlerts takes a userId. Without that filter this
    // request would hand one user every other user's reminders.
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

    // body is a Text column, so leaving it out of the list keeps a page of
    // reminders from dragging every full message across the wire. dedupeKey is
    // left out because it is internal bookkeeping and no screen shows it.
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

    // Soonest first, because an alert list answers "what is coming up". A
    // reminder due tomorrow belongs above one queued yesterday for next month,
    // which is the opposite of how the other modules sort.
    it("sorts by scheduled time, soonest first", async () => {
      const later = await testAlert(userId, "Later", { scheduledFor: LATER });
      const soon = await testAlert(userId, "Soon", { scheduledFor: SOON });

      const response = await get("/alerts");

      expect(response.status).toBe(200);

      // Filters the response down to these two ids before comparing, so an
      // unrelated row belonging to the test user cannot break it.
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

  // Every filter is optional and Prisma drops any key whose value is undefined,
  // so these prove the filter reaches the query when it is sent and that the
  // rest of the list is not quietly hidden when it is not.
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

    // A filter naming another user's application must not become a way around
    // the userId filter. The two conditions are combined with AND, so this
    // returns nothing rather than their rows.
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

  // A malformed query string is the client's mistake, so it has to come back as
  // 400. Without the schema, a negative page reaches Prisma and becomes a 500,
  // which reads in the logs like a server defect.
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

      // The detail view is where the message is actually read, so unlike the
      // list, body has to come back with it.
      expect(response.body.body).toBe("The full message.");
      expect(response.body.status).toBe("PENDING");
    });

    it("does not expose the dedupe key", async () => {
      const created = await testAlert(userId, "Private Key");

      const response = await get(`/alerts/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.dedupeKey).toBeUndefined();
    });

    // 404 rather than 403 on purpose. A 403 would confirm that the id belongs to
    // a real alert, which is a way to map out other users' data one guess at a
    // time. From the client's side, someone else's alert simply is not there.
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

    // This is what alertIdRules buys. Postgres rejects a non uuid string as a
    // type error, so without the check this comes back as a 500.
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

      // 204 means there is no body to check, so the proof is that the row can no
      // longer be read back.
      const after = await get(`/alerts/${created.id}`);
      expect(after.status).toBe(404);
    });

    // Deleting a reminder must not take the application or the contact with it.
    // The cascade in the schema runs the other way, from parent to child, and
    // this is the test that would catch it being written backwards.
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

    // The one that matters. deleteMany filters by userId inside the query, so a
    // guessed id matches nothing rather than deleting somebody else's row.
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

    // Deleting frees the dedupe key, so the same reminder can be scheduled
    // again afterwards. Without this the unique index would turn a delete into
    // a permanent ban on that alert ever existing again.
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

  // requireAuth is mounted in app.ts rather than in the router, so these prove
  // the wiring is right. A route added to this module gets the guard by
  // default, and that is the safe direction for a mistake to fall in.
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
