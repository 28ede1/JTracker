// ---------------------------------------------------------------------------
// Company route tests
//
// The whole path end to end: a real HTTP request, through the validation rules
// and the service, to the real database and back. supertest drives the app
// object directly, so nothing has to be listening on a port.
//
// company.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for,
// because they prove the wiring rather than the rules.
// ---------------------------------------------------------------------------

import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

// ---------------------------------------------------------------------------
// Cleanup
//
// These tests run against the development database, so they have to remove
// exactly the rows they create and nothing else. Every company made here is
// named with the prefix below, which lets a single query find all of them.
//
// Deleting by name instead of by recorded id matters for two reasons. A test
// that fails before it can record an id still gets cleaned up, and rows left
// behind by a run that was interrupted partway through get swept on the next
// start instead of piling up.
// ---------------------------------------------------------------------------

const TEST_PREFIX = "Test ";

// Builds a company name that the cleanup query is guaranteed to match. Using
// this instead of a plain string stops a future test from inventing a name
// that cleanup does not know to look for.
function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

function deleteTestCompanies() {
  return prisma.company.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
}

// Clears strays from any earlier run that ended before it could clean up.
beforeAll(deleteTestCompanies);

// Stops each test from seeing rows created by the test before it.
afterEach(deleteTestCompanies);

describe("POST /companies", () => {
  it("creates a company and returns 201", async () => {
    const response = await request(app)
      .post("/companies")
      .send({ name: testName("Stripe"), domain: "test-stripe.example.com" });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe(testName("Stripe"));

    // A generated id proves the row really reached the database.
    expect(response.body.id).toBeDefined();
  });

  it("returns 400 when name is missing", async () => {
    const response = await request(app)
      .post("/companies")
      .send({ domain: "no-name.example.com" });

    expect(response.status).toBe(400);
  });

  it("does not save fields that are not in the schema", async () => {
    const response = await request(app)
      .post("/companies")
      .send({ name: testName("Extra"), banana: 7 });

    expect(response.status).toBe(201);
    expect(response.body.banana).toBeUndefined();
  });
});

describe("GET /companies", () => {
  it("returns a list containing a created company", async () => {
    await request(app).post("/companies").send({ name: testName("Listed") });

    const response = await request(app)
      .get("/companies")
      .query({
        page: 1,
        limit: 50,
      });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // Checks that this specific company is present rather than checking the
    // array length, because other rows may exist in the database.
    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Listed"));
  });

  // Only the size is checked. Which company comes back depends on rows this
  // test did not create, because the list is sorted by name across the whole
  // table, so asserting a name here would pass only while the table is empty.
  it("returns at most limit companies", async () => {
    await request(app).post("/companies").send({ name: testName("Company A") });
    await request(app).post("/companies").send({ name: testName("Company B") });
    await request(app).post("/companies").send({ name: testName("Company C") });

    const response = await request(app)
      .get("/companies")
      .query({ page: 1, limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
  });

  // Adding q is what makes this one deterministic. The search narrows the
  // result to rows this test created, so the exact name on each page can be
  // asserted instead of just the count.
  it("returns the next rows when the page increases", async () => {
    await request(app).post("/companies").send({ name: testName("Company A") });
    await request(app).post("/companies").send({ name: testName("Company B") });

    const search = { q: testName("Company"), limit: 1 };

    const page1 = await request(app)
      .get("/companies")
      .query({ ...search, page: 1 });

    const page2 = await request(app)
      .get("/companies")
      .query({ ...search, page: 2 });

    expect(page1.body[0].name).toBe(testName("Company A"));
    expect(page2.body[0].name).toBe(testName("Company B"));
  });

  it("returns an empty list for a page past the end", async () => {
    await request(app).post("/companies").send({ name: testName("Company A") });

    const response = await request(app)
      .get("/companies")
      .query({ q: testName("Company"), limit: 1, page: 99 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe("GET /companies search", () => {
  it("returns only companies whose name contains the search term", async () => {
    await request(app).post("/companies").send({ name: testName("Company A") });
    await request(app).post("/companies").send({ name: testName("Unrelated") });

    const response = await request(app)
      .get("/companies")
      .query({ q: testName("Company") });

    expect(response.status).toBe(200);

    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Company A"));
    expect(names).not.toContain(testName("Unrelated"));
  });

  // Without mode "insensitive" in the service, this test fails and real users
  // typing lowercase find nothing.
  it("matches regardless of letter case", async () => {
    await request(app).post("/companies").send({ name: testName("Casing") });

    const response = await request(app)
      .get("/companies")
      .query({ q: "test casing" });

    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Casing"));
  });

  it("returns an empty list when nothing matches", async () => {
    await request(app).post("/companies").send({ name: testName("Company A") });

    const response = await request(app)
      .get("/companies")
      .query({ q: testName("NothingNamedLikeThis") });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // A cleared search box sends q as an empty string, which must list everything
  // rather than fail.
  it("ignores an empty search term", async () => {
    await request(app).post("/companies").send({ name: testName("Listed") });

    const response = await request(app).get("/companies").query({ q: "" });

    expect(response.status).toBe(200);

    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Listed"));
  });
});

// A malformed query string is the client's mistake, so it has to come back as
// 400. Before the schema existed, a negative page reached Prisma and became a
// 500, which reads in the logs like a server defect.
describe("GET /companies validation", () => {
  it("returns 400 when page is below 1", async () => {
    const response = await request(app).get("/companies").query({ page: -5 });

    expect(response.status).toBe(400);
  });

  it("returns 400 when limit is above the maximum", async () => {
    const response = await request(app).get("/companies").query({ limit: 1000 });

    expect(response.status).toBe(400);
  });

  it("returns 400 when page is not a number", async () => {
    const response = await request(app).get("/companies").query({ page: "abc" });

    expect(response.status).toBe(400);
  });
});

describe("GET /companies/:id", () => {
  it("returns the company when the id exists", async () => {
    const created = await request(app)
      .post("/companies")
      .send({ name: testName("Findable") });

    const response = await request(app).get(`/companies/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.name).toBe(testName("Findable"));
  });

  it("returns 404 when the id is a valid uuid but no company has it", async () => {
    const response = await request(app).get(
      "/companies/11111111-1111-1111-1111-111111111111",
    );

    expect(response.status).toBe(404);
  });
});
