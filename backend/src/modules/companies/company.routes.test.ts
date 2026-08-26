// supertest is a library that lets your tests make manual HTTP requests to your application
// without starting a server. example: request(app).post("/companies")

import request from "supertest";

// describe: groups related tests
// it: defines a test case
// expect: checks expected results
// afterEach: runs cleanup after each test
// beforeAll: runs once before the first test in the file

import { afterEach, beforeAll, describe, expect, it } from "vitest";

// createApp is a function that creates and returns
// the Express app—the object that contains the routes,
// middleware, and logic used by the backend to handle HTTP requests

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

    const response = await request(app).get("/companies");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // Checks that this specific company is present rather than checking the
    // array length, because other rows may exist in the database.
    const names = response.body.map((company: { name: string }) => company.name);
    expect(names).toContain(testName("Listed"));
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
