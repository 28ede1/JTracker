// ---------------------------------------------------------------------------
// Contact route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to listen on a port.
//
// The thing only this file can prove is scoping. Contacts belong to one person,
// so a second account's rows have to exist to check they never appear, and no
// test of the rules alone could show that.
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

    // Contact.userId is a foreign key into the User table, and sign-up only
    // creates the Supabase auth user, so nothing writes that row yet. Delete
    // this block the day sign-up starts doing it.
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

      expect(response.body.id).toBeDefined();
    });

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

    it("stores a contacted date sent as text", async () => {
      const response = await post(
        "/contacts",
        newContact("Dated", { lastContactedAt: "2026-03-01T12:00:00.000Z" }),
      );

      expect(response.status).toBe(201);

      expect(response.body.lastContactedAt).toBe("2026-03-01T12:00:00.000Z");
    });

    it("links the contact to a company", async () => {
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

      expect(firstNamesOf(response.body)).toContain(testName("Listed"));
    });

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

    it("matches regardless of letter case", async () => {
      await post("/contacts", newContact("Casing"));

      const response = await get("/contacts").query({ q: "test casing" });

      expect(firstNamesOf(response.body)).toContain(testName("Casing"));
    });

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

    // 404 rather than 403. A 403 would confirm that the id belongs to a real
    // contact, which is a way to map out other users' data one guess at a time.
    // From the client's side, someone else's contact is simply not there.
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

    it("returns 400 when the id is not a uuid", async () => {
      const response = await get("/contacts/not-a-uuid");

      expect(response.status).toBe(400);
    });
  });
});
