// ---------------------------------------------------------------------------
// Company route tests
//
// The whole path end to end: a real HTTP request, through the validation rules
// and the service, to the real database and back. supertest drives the app
// object directly, so nothing has to listen on a port.
//
// Two things only this file can prove: that pagination and case-insensitive
// search behave against real rows rather than against a schema, and that a
// malformed query string comes back as a 400 instead of reaching Prisma and
// becoming a 500.
// ---------------------------------------------------------------------------

import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

const TEST_PREFIX = "Test ";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

function deleteTestCompanies() {
  return prisma.company.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
}

beforeAll(deleteTestCompanies);

afterEach(deleteTestCompanies);

describe("POST /companies", () => {
  it("creates a company and returns 201", async () => {
    const response = await request(app)
      .post("/companies")
      .send({ name: testName("Stripe"), domain: "test-stripe.example.com" });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe(testName("Stripe"));

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

    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Listed"));
  });

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

  it("ignores an empty search term", async () => {
    await request(app).post("/companies").send({ name: testName("Listed") });

    const response = await request(app).get("/companies").query({ q: "" });

    expect(response.status).toBe(200);

    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Listed"));
  });
});

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
