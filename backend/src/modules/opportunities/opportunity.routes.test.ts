// supertest is a library that lets your tests make real HTTP requests to your
// application without starting a server. example: request(app).post("/opportunities")

import request from "supertest";

// describe: groups related tests
// it: defines a test case
// expect: checks expected results
// afterEach: runs cleanup after each test
// beforeAll: runs once before the first test in the file

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

// ---------------------------------------------------------------------------
// Cleanup
//
// These tests run against the development database, so they have to remove
// exactly the rows they create and nothing else. Every opportunity made here is
// titled with the prefix below, which lets a single query find all of them.
//
// Deleting by title instead of by recorded id matters for two reasons. A test
// that fails before it can record an id still gets cleaned up, and rows left
// behind by a run that was interrupted partway through get swept on the next
// start instead of piling up.
// ---------------------------------------------------------------------------

const TEST_PREFIX = "Test ";

// Builds a title that the cleanup query is guaranteed to match. Using this
// instead of a plain string stops a future test from inventing a title that
// cleanup does not know to look for.
function testTitle(label: string) {
  return `${TEST_PREFIX}${label}`;
}

// Opportunities go first because they point at companies. Deleting the parent
// row while a child still references it is the kind of ordering mistake that
// only shows up once a foreign key is set to restrict, so the habit is worth
// keeping even though this relation is optional.
async function deleteTestData() {
  await prisma.opportunity.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });

  await prisma.company.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
}

// Clears strays from any earlier run that ended before it could clean up.
beforeAll(deleteTestData);

// Stops each test from seeing rows created by the test before it.
afterEach(deleteTestData);

// ---------------------------------------------------------------------------
// Test data builder
//
// Every POST needs type, title and sourceUrl, so repeating all three in twenty
// tests would bury the one field each test actually cares about. This returns
// a valid body and lets the caller override only what is being tested, which
// keeps the intent of each test on screen.
// ---------------------------------------------------------------------------

function newOpportunity(label: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "INTERNSHIP",
    title: testTitle(label),
    sourceUrl: "https://example.com/opportunity",
    ...overrides,
  };
}

// Reads the titles out of a list response. Used by most of the filter tests,
// which care about which rows came back rather than the whole row.
function titlesOf(body: { title: string }[]) {
  return body.map((opportunity) => opportunity.title);
}

describe("POST /opportunities", () => {
  it("creates an opportunity and returns 201", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Created"));

    expect(response.status).toBe(201);
    expect(response.body.title).toBe(testTitle("Created"));

    // A generated id proves the row really reached the database.
    expect(response.body.id).toBeDefined();

    // The database default, not something the client sent. Checking it here
    // documents that a new posting is visible in the feed straight away.
    expect(response.body.isActive).toBe(true);
  });

  it("returns 400 when a required field is missing", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send({ type: "INTERNSHIP", sourceUrl: "https://example.com/opportunity" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when type is not an allowed value", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Bad Type", { type: "project" }));

    expect(response.status).toBe(400);
  });

  // sourceUrl is rendered as a clickable link, so a value that is not a real
  // url has to be stopped at the edge rather than stored and shown to a user.
  it("returns 400 when sourceUrl is not a url", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Bad Url", { sourceUrl: "not-a-url" }));

    expect(response.status).toBe(400);
  });

  // This is the security behaviour. Fields not declared in the schema must
  // never reach the database.
  it("does not save fields that are not in the schema", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Extra", { banana: 7 }));

    expect(response.status).toBe(201);
    expect(response.body.banana).toBeUndefined();
  });

  // The client sends a date as text and Prisma needs a Date, so this proves the
  // coercion in the schema actually runs on a real request.
  it("stores a posted date sent as text", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Dated", { postedAt: "2026-08-01T12:00:00.000Z" }));

    expect(response.status).toBe(201);

    // JSON has no date type, so the response carries the ISO string back.
    expect(response.body.postedAt).toBe("2026-08-01T12:00:00.000Z");
  });

  it("links the opportunity to a company", async () => {
    // Created with Prisma rather than through POST /companies on purpose. The
    // company endpoint is not what this file tests, so a bug over there should
    // not turn up as a failure here.
    const company = await prisma.company.create({
      data: { name: testTitle("Acme") },
    });

    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Linked", { companyId: company.id }));

    expect(response.status).toBe(201);
    expect(response.body.companyId).toBe(company.id);
  });
});

describe("GET /opportunities", () => {
  it("returns a list containing a created opportunity", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Listed"));

    const response = await request(app)
      .get("/opportunities")
      .query({ page: 1, limit: 50 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // Checks that this specific opportunity is present rather than checking the
    // array length, because other rows may exist in the database.
    expect(titlesOf(response.body)).toContain(testTitle("Listed"));
  });

  // Only the size is checked. Which row comes back depends on rows this test
  // did not create, because the list is sorted across the whole table.
  it("returns at most limit opportunities", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Limit A"));
    await request(app).post("/opportunities").send(newOpportunity("Limit B"));
    await request(app).post("/opportunities").send(newOpportunity("Limit C"));

    const response = await request(app)
      .get("/opportunities")
      .query({ page: 1, limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
  });

  // Two things make this deterministic. The search narrows the result to rows
  // this test created, and the posted dates decide their order, so the exact
  // title on each page can be asserted instead of just the count.
  it("returns the next rows when the page increases", async () => {
    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Page A", { postedAt: "2026-01-03T00:00:00.000Z" }));

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Page B", { postedAt: "2026-01-02T00:00:00.000Z" }));

    const search = { q: testTitle("Page"), limit: 1 };

    const page1 = await request(app)
      .get("/opportunities")
      .query({ ...search, page: 1 });

    const page2 = await request(app)
      .get("/opportunities")
      .query({ ...search, page: 2 });

    expect(page1.body[0].title).toBe(testTitle("Page A"));
    expect(page2.body[0].title).toBe(testTitle("Page B"));
  });

  it("returns an empty list for a page past the end", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Page A"));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: testTitle("Page"), limit: 1, page: 99 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // The feed is about what is open now, so the newest posting leads. A row with
  // no posted date is the case Postgres would otherwise put first, which is why
  // the service asks for nulls last and why that deserves its own test.
  it("sorts by posted date, newest first, with undated rows last", async () => {
    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Order B", { postedAt: "2026-01-02T00:00:00.000Z" }));

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Order C"));

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Order A", { postedAt: "2026-01-03T00:00:00.000Z" }));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: testTitle("Order") });

    expect(response.status).toBe(200);

    expect(titlesOf(response.body)).toEqual([
      testTitle("Order A"),
      testTitle("Order B"),
      testTitle("Order C"),
    ]);
  });
});

describe("GET /opportunities filters", () => {
  it("returns only opportunities whose title contains the search term", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Match A"));
    await request(app).post("/opportunities").send(newOpportunity("Unrelated"));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: testTitle("Match") });

    expect(response.status).toBe(200);

    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("Match A"));
    expect(titles).not.toContain(testTitle("Unrelated"));
  });

  // Without mode "insensitive" in the service, this test fails and real users
  // typing lowercase find nothing.
  it("matches regardless of letter case", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Casing"));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: "test casing" });

    expect(titlesOf(response.body)).toContain(testTitle("Casing"));
  });

  it("returns an empty list when nothing matches", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Match A"));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: testTitle("NothingTitledLikeThis") });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("filters by type", async () => {
    await request(app).post("/opportunities").send(newOpportunity("Internship"));

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Hackathon", { type: "HACKATHON" }));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: TEST_PREFIX.trim(), type: "HACKATHON" });

    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("Hackathon"));
    expect(titles).not.toContain(testTitle("Internship"));
  });

  it("filters by work mode", async () => {
    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Remote", { workMode: "REMOTE" }));

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("Onsite", { workMode: "ONSITE" }));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: TEST_PREFIX.trim(), workMode: "REMOTE" });

    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("Remote"));
    expect(titles).not.toContain(testTitle("Onsite"));
  });

  it("filters by company", async () => {
    const company = await prisma.company.create({
      data: { name: testTitle("Acme") },
    });

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("At Acme", { companyId: company.id }));

    await request(app).post("/opportunities").send(newOpportunity("No Company"));

    const response = await request(app)
      .get("/opportunities")
      .query({ companyId: company.id });

    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("At Acme"));
    expect(titles).not.toContain(testTitle("No Company"));
  });

  // Location is free text in the database, so the filter matches part of the
  // value. Searching "New York" has to find "New York, NY".
  it("filters by location, matching part of the value", async () => {
    await request(app)
      .post("/opportunities")
      .send(newOpportunity("In New York", { location: "New York, NY" }));

    await request(app)
      .post("/opportunities")
      .send(newOpportunity("In Boston", { location: "Boston, MA" }));

    const response = await request(app)
      .get("/opportunities")
      .query({ q: TEST_PREFIX.trim(), location: "new york" });

    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("In New York"));
    expect(titles).not.toContain(testTitle("In Boston"));
  });

  // A closed posting is still a row, it just should not appear in the feed.
  // isActive is not part of the create schema, so the flip happens through
  // Prisma, the same way a future closing job would do it.
  it("hides inactive opportunities by default", async () => {
    const created = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Closed"));

    await prisma.opportunity.update({
      where: { id: created.body.id },
      data: { isActive: false },
    });

    const response = await request(app)
      .get("/opportunities")
      .query({ q: testTitle("Closed") });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns inactive opportunities when isActive is false", async () => {
    const created = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Closed"));

    await request(app).post("/opportunities").send(newOpportunity("Open"));

    await prisma.opportunity.update({
      where: { id: created.body.id },
      data: { isActive: false },
    });

    const response = await request(app)
      .get("/opportunities")
      .query({ q: TEST_PREFIX.trim(), isActive: "false" });

    expect(response.status).toBe(200);

    // The filter is an exact match, not "include closed ones too", so the open
    // posting has to be absent.
    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("Closed"));
    expect(titles).not.toContain(testTitle("Open"));
  });
});

// A malformed query string is the client's mistake, so it has to come back as
// 400. Before the schema existed, a negative page reached Prisma and became a
// 500, which reads in the logs like a server defect.
describe("GET /opportunities validation", () => {
  it("returns 400 when page is below 1", async () => {
    const response = await request(app).get("/opportunities").query({ page: -5 });

    expect(response.status).toBe(400);
  });

  it("returns 400 when limit is above the maximum", async () => {
    const response = await request(app).get("/opportunities").query({ limit: 1000 });

    expect(response.status).toBe(400);
  });

  it("returns 400 when page is not a number", async () => {
    const response = await request(app).get("/opportunities").query({ page: "abc" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when type is not an allowed value", async () => {
    const response = await request(app)
      .get("/opportunities")
      .query({ type: "project" });

    expect(response.status).toBe(400);
  });

  // Anything other than the two literal strings is a typo, and a typo must not
  // quietly flip which half of the feed comes back.
  it("returns 400 when isActive is not true or false", async () => {
    const response = await request(app)
      .get("/opportunities")
      .query({ isActive: "yes" });

    expect(response.status).toBe(400);
  });
});

describe("GET /opportunities/:id", () => {
  it("returns the opportunity when the id exists", async () => {
    const created = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Findable"));

    const response = await request(app).get(`/opportunities/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.title).toBe(testTitle("Findable"));
  });

  // The detail view shows the company name, so the include in the service is
  // part of the contract and not just an implementation detail.
  it("includes the company of the opportunity", async () => {
    const company = await prisma.company.create({
      data: { name: testTitle("Acme") },
    });

    const created = await request(app)
      .post("/opportunities")
      .send(newOpportunity("With Company", { companyId: company.id }));

    const response = await request(app).get(`/opportunities/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.company.name).toBe(testTitle("Acme"));
  });

  it("returns 404 when the id is a valid uuid but no opportunity has it", async () => {
    const response = await request(app).get(
      "/opportunities/11111111-1111-1111-1111-111111111111",
    );

    expect(response.status).toBe(404);
  });

  // This is what opportunityIdRules buys. Postgres rejects a non uuid string as
  // a type error, so without the check this request would come back as a 500.
  it("returns 400 when the id is not a uuid", async () => {
    const response = await request(app).get("/opportunities/not-a-uuid");

    expect(response.status).toBe(400);
  });
});
