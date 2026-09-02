// ---------------------------------------------------------------------------
// Contact route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to be listening on a port.
//
// contact.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for.
//
// The one thing only this file can prove is scoping. Contacts belong to one
// person, so several tests below create a second account's rows and check they
// never appear, which is something no test of the rules alone could show.
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
// file skips instead of failing, the same way the frontend live tests do, so a
// fresh clone still runs green. See .env.example.
// ---------------------------------------------------------------------------

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

// ---------------------------------------------------------------------------
// Cleanup
//
// These tests run against the development database, so they have to remove
// exactly the rows they create and nothing else. Every contact made here has a
// first name carrying the prefix below, which lets a single query find them.
//
// Deleting by name instead of by recorded id matters for two reasons. A test
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

// Contacts go first because they point at both companies and users. Deleting a
// parent row while a child still references it is the ordering mistake that
// only shows up once a foreign key stops cascading.
async function deleteTestData() {
  await prisma.contact.deleteMany({
    where: { firstName: { startsWith: TEST_PREFIX } },
  });

  await prisma.company.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });

  await prisma.user.deleteMany({
    where: { username: { startsWith: OTHER_USER_PREFIX } },
  });
}

describe.skipIf(!email || !password)("contact routes", () => {
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

    // Contact.userId is a foreign key into the User table, and nothing writes
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
  // being repeated on thirty lines. Forgetting it on one test would turn a real
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

  // Both fields are required on every POST, so repeating them in twenty tests
  // would bury the one field each test actually cares about.
  function newContact(label: string, overrides: Record<string, unknown> = {}) {
    return {
      firstName: testName(label),
      relationship: "RECRUITER",
      ...overrides,
    };
  }

  function firstNamesOf(body: { firstName: string }[]) {
    return body.map((contact) => contact.firstName);
  }

  // Stands in for a second person using the app. Built straight through Prisma
  // because there is no way to create another user over HTTP, and the point is
  // to prove the scoping in the service rather than to test sign-up.
  async function otherUsersContact(label: string) {
    const other = await prisma.user.create({
      data: {
        id: randomUUID(),
        username: `${OTHER_USER_PREFIX}${randomUUID().slice(0, 8)}`,
      },
    });

    return prisma.contact.create({
      data: {
        userId: other.id,
        firstName: testName(label),
        relationship: "OTHER",
      },
    });
  }

  describe("POST /contacts", () => {
    it("creates a contact and returns 201", async () => {
      const response = await post("/contacts", newContact("Created"));

      expect(response.status).toBe(201);
      expect(response.body.firstName).toBe(testName("Created"));

      // A generated id proves the row really reached the database.
      expect(response.body.id).toBeDefined();
    });

    // The important one. Ownership comes from the verified token, never from
    // the request, so a client cannot file a contact under someone else.
    it("saves the contact against the signed-in user, ignoring any userId sent", async () => {
      const response = await post(
        "/contacts",
        newContact("Owned", { userId: randomUUID() }),
      );

      expect(response.status).toBe(201);
      expect(response.body.userId).toBe(userId);
    });

    it("returns 400 when first name is missing", async () => {
      const response = await post("/contacts", { relationship: "RECRUITER" });

      expect(response.status).toBe(400);
    });

    it("returns 400 when relationship is not an allowed value", async () => {
      const response = await post(
        "/contacts",
        newContact("Bad Relationship", { relationship: "FRIEND" }),
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 when email is not an email", async () => {
      const response = await post(
        "/contacts",
        newContact("Bad Email", { email: "ada-at-example" }),
      );

      expect(response.status).toBe(400);
    });

    it("does not save fields that are not in the schema", async () => {
      const response = await post(
        "/contacts",
        newContact("Extra", { banana: 7 }),
      );

      expect(response.status).toBe(201);
      expect(response.body.banana).toBeUndefined();
    });

    // The client sends a date as text and Prisma needs a Date, so this proves
    // the coercion in the schema actually runs on a real request.
    it("stores a contacted date sent as text", async () => {
      const response = await post(
        "/contacts",
        newContact("Dated", { lastContactedAt: "2026-03-01T12:00:00.000Z" }),
      );

      expect(response.status).toBe(201);

      // JSON has no date type, so the response carries the ISO string back.
      expect(response.body.lastContactedAt).toBe("2026-03-01T12:00:00.000Z");
    });

    it("links the contact to a company", async () => {
      // Created with Prisma rather than through POST /companies on purpose. The
      // company endpoint is not what this file tests, so a bug over there
      // should not turn up as a failure here.
      const company = await prisma.company.create({
        data: { name: testName("Acme") },
      });

      const response = await post(
        "/contacts",
        newContact("Linked", { companyId: company.id }),
      );

      expect(response.status).toBe(201);
      expect(response.body.companyId).toBe(company.id);
    });
  });

  describe("GET /contacts", () => {
    it("returns a list containing a created contact", async () => {
      await post("/contacts", newContact("Listed"));

      const response = await get("/contacts").query({ page: 1, limit: 50 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Checks that this specific contact is present rather than checking the
      // array length, because other rows may exist in the database.
      expect(firstNamesOf(response.body)).toContain(testName("Listed"));
    });

    // The whole reason listContacts takes a userId. Without that filter this
    // request would hand one user the entire contact book of every other user.
    it("does not return another user's contact", async () => {
      await otherUsersContact("Not Mine");
      await post("/contacts", newContact("Mine"));

      const response = await get("/contacts").query({ q: TEST_PREFIX.trim() });

      expect(response.status).toBe(200);

      const names = firstNamesOf(response.body);
      expect(names).toContain(testName("Mine"));
      expect(names).not.toContain(testName("Not Mine"));
    });

    it("returns at most limit contacts", async () => {
      await post("/contacts", newContact("Limit A"));
      await post("/contacts", newContact("Limit B"));
      await post("/contacts", newContact("Limit C"));

      const response = await get("/contacts").query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
    });

    // Two things make this deterministic. The search narrows the result to rows
    // this test created, and the contacted dates decide their order, so the
    // exact name on each page can be asserted instead of just the count.
    it("returns the next rows when the page increases", async () => {
      await post(
        "/contacts",
        newContact("Page A", { lastContactedAt: "2026-01-02T00:00:00.000Z" }),
      );

      await post(
        "/contacts",
        newContact("Page B", { lastContactedAt: "2026-01-03T00:00:00.000Z" }),
      );

      const search = { q: testName("Page"), limit: 1 };

      const page1 = await get("/contacts").query({ ...search, page: 1 });
      const page2 = await get("/contacts").query({ ...search, page: 2 });

      expect(page1.body[0].firstName).toBe(testName("Page A"));
      expect(page2.body[0].firstName).toBe(testName("Page B"));
    });

    it("returns an empty list for a page past the end", async () => {
      await post("/contacts", newContact("Page A"));

      const response = await get("/contacts").query({
        q: testName("Page"),
        limit: 1,
        page: 99,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    // The list is about who has gone longest without hearing from you, so the
    // oldest contacted date leads. A contact that has never been reached has no
    // date at all, and the service asks for those last rather than letting
    // Postgres put them first, which is the part worth pinning down.
    it("sorts by contacted date, oldest first, with never-contacted last", async () => {
      await post(
        "/contacts",
        newContact("Order B", { lastContactedAt: "2026-01-02T00:00:00.000Z" }),
      );

      await post("/contacts", newContact("Order C"));

      await post(
        "/contacts",
        newContact("Order A", { lastContactedAt: "2026-01-01T00:00:00.000Z" }),
      );

      const response = await get("/contacts").query({ q: testName("Order") });

      expect(response.status).toBe(200);

      expect(firstNamesOf(response.body)).toEqual([
        testName("Order A"),
        testName("Order B"),
        testName("Order C"),
      ]);
    });
  });

  describe("GET /contacts filters", () => {
    it("returns only contacts whose name contains the search term", async () => {
      await post("/contacts", newContact("Match A"));
      await post("/contacts", newContact("Unrelated"));

      const response = await get("/contacts").query({ q: testName("Match") });

      expect(response.status).toBe(200);

      const names = firstNamesOf(response.body);
      expect(names).toContain(testName("Match A"));
      expect(names).not.toContain(testName("Unrelated"));
    });

    // Without mode "insensitive" in the service, this test fails and real users
    // typing lowercase find nothing.
    it("matches regardless of letter case", async () => {
      await post("/contacts", newContact("Casing"));

      const response = await get("/contacts").query({ q: "test casing" });

      expect(firstNamesOf(response.body)).toContain(testName("Casing"));
    });

    // The search covers the company name too, which is how "who do I know at
    // Acme" works without a separate filter.
    it("matches on the company name", async () => {
      const company = await prisma.company.create({
        data: { name: testName("Acme") },
      });

      await post("/contacts", newContact("At Acme", { companyId: company.id }));
      await post("/contacts", newContact("Elsewhere"));

      const response = await get("/contacts").query({ q: testName("Acme") });

      const names = firstNamesOf(response.body);
      expect(names).toContain(testName("At Acme"));
      expect(names).not.toContain(testName("Elsewhere"));
    });

    it("returns an empty list when nothing matches", async () => {
      await post("/contacts", newContact("Match A"));

      const response = await get("/contacts").query({
        q: testName("NobodyNamedLikeThis"),
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("filters by relationship", async () => {
      await post("/contacts", newContact("Recruiter"));

      await post(
        "/contacts",
        newContact("Alumni", { relationship: "ALUMNI" }),
      );

      const response = await get("/contacts").query({
        q: TEST_PREFIX.trim(),
        relationship: "ALUMNI",
      });

      const names = firstNamesOf(response.body);
      expect(names).toContain(testName("Alumni"));
      expect(names).not.toContain(testName("Recruiter"));
    });

    it("filters by company", async () => {
      const company = await prisma.company.create({
        data: { name: testName("Acme") },
      });

      await post("/contacts", newContact("At Acme", { companyId: company.id }));
      await post("/contacts", newContact("No Company"));

      const response = await get("/contacts").query({ companyId: company.id });

      const names = firstNamesOf(response.body);
      expect(names).toContain(testName("At Acme"));
      expect(names).not.toContain(testName("No Company"));
    });
  });

  // A malformed query string is the client's mistake, so it has to come back as
  // 400. Without the schema, a negative page reaches Prisma and becomes a 500,
  // which reads in the logs like a server defect.
  describe("GET /contacts validation", () => {
    it("returns 400 when page is below 1", async () => {
      const response = await get("/contacts").query({ page: -5 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when limit is above the maximum", async () => {
      const response = await get("/contacts").query({ limit: 1000 });

      expect(response.status).toBe(400);
    });

    it("returns 400 when page is not a number", async () => {
      const response = await get("/contacts").query({ page: "abc" });

      expect(response.status).toBe(400);
    });

    it("returns 400 when relationship is not an allowed value", async () => {
      const response = await get("/contacts").query({ relationship: "FRIEND" });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /contacts/:id", () => {
    it("returns the contact when the id exists", async () => {
      const created = await post("/contacts", newContact("Findable"));

      const response = await get(`/contacts/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe(testName("Findable"));
    });

    // The detail view shows where the person works, so the include in the
    // service is part of the contract and not just an implementation detail.
    it("includes the company of the contact", async () => {
      const company = await prisma.company.create({
        data: { name: testName("Acme") },
      });

      const created = await post(
        "/contacts",
        newContact("With Company", { companyId: company.id }),
      );

      const response = await get(`/contacts/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.company.name).toBe(testName("Acme"));
    });

    // 404 rather than 403 on purpose. A 403 would confirm that the id belongs
    // to a real contact, which is a way to map out other users' data one guess
    // at a time. From the client's side, someone else's contact simply is not
    // there.
    it("returns 404 for another user's contact", async () => {
      const contact = await otherUsersContact("Not Mine");

      const response = await get(`/contacts/${contact.id}`);

      expect(response.status).toBe(404);
    });

    it("returns 404 when the id is a valid uuid but no contact has it", async () => {
      const response = await get(
        "/contacts/11111111-1111-1111-1111-111111111111",
      );

      expect(response.status).toBe(404);
    });

    // This is what contactIdRules buys. Postgres rejects a non uuid string as a
    // type error, so without the check this request would come back as a 500.
    it("returns 400 when the id is not a uuid", async () => {
      const response = await get("/contacts/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });
});
