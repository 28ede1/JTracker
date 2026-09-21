// ---------------------------------------------------------------------------
// Opportunity route tests
//
// The whole path end to end: a real HTTP request, through the validation rules
// and the service, to the real database and back. supertest drives the app
// object directly, so nothing has to listen on a port. No log-in step, because
// postings are shared reference data mounted without requireAuth.
//
// Three things only this file can prove: the feed ordering, which puts the
// newest posting first and rows with no posted date last; the company link,
// which needs a real row on the other end; and that a malformed query string
// comes back as a 400 instead of reaching Prisma and becoming a 500.
// ---------------------------------------------------------------------------

import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

const TEST_PREFIX = "Test ";

function testTitle(label: string) {
  return `${TEST_PREFIX}${label}`;
}

async function deleteTestData() {
  await prisma.opportunity.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });

  await prisma.company.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
}

beforeAll(deleteTestData);

afterEach(deleteTestData);

function newOpportunity(label: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "INTERNSHIP",
    title: testTitle(label),
    sourceUrl: "https://example.com/opportunity",
    ...overrides,
  };
}

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

    expect(response.body.id).toBeDefined();

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

  it("returns 400 when sourceUrl is not a url", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Bad Url", { sourceUrl: "not-a-url" }));

    expect(response.status).toBe(400);
  });

  it("does not save fields that are not in the schema", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Extra", { banana: 7 }));

    expect(response.status).toBe(201);
    expect(response.body.banana).toBeUndefined();
  });

  it("stores a posted date sent as text", async () => {
    const response = await request(app)
      .post("/opportunities")
      .send(newOpportunity("Dated", { postedAt: "2026-08-01T12:00:00.000Z" }));

    expect(response.status).toBe(201);

    expect(response.body.postedAt).toBe("2026-08-01T12:00:00.000Z");
  });

  it("links the opportunity to a company", async () => {
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

    expect(titlesOf(response.body)).toContain(testTitle("Listed"));
  });

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

    const titles = titlesOf(response.body);
    expect(titles).toContain(testTitle("Closed"));
    expect(titles).not.toContain(testTitle("Open"));
  });
});

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

  it("returns 400 when the id is not a uuid", async () => {
    const response = await request(app).get("/opportunities/not-a-uuid");

    expect(response.status).toBe(400);
  });
});
