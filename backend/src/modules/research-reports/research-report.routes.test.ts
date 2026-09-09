// ---------------------------------------------------------------------------
// Research Report route tests
//
// The whole path end to end: a real HTTP request, through the validation rules
// and the service, to the real database and back. supertest drives the app
// object directly, so nothing has to be listening on a port.
//
// research-report.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for,
// because they prove the wiring rather than the rules.
//
// There is no sign-in step in this file, unlike the fit analysis or application
// tests. Research reports are shared reference data, so the router is mounted
// without requireAuth in app.ts and every request below is anonymous.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

// ---------------------------------------------------------------------------
// Cleanup
//
// These tests run against the development database, so they have to remove
// exactly the rows they create and nothing else. A research report has no name
// of its own, so the prefix goes on the rows it points at: every company and
// opportunity made here carries it, and reports are found through their company.
//
// Deleting by prefix instead of by recorded id matters for two reasons. A test
// that fails before it can record an id still gets cleaned up, and rows left
// behind by a run that was interrupted partway through get swept on the next
// start instead of piling up.
//
// The prefix is longer than the plain "Test " the other route test files use.
// It still begins with "Test ", so their broader sweeps would also clear these
// rows, but the query below can only ever match rows this file created. That
// keeps this file from deleting an opportunity that some other test's
// application row still points at, which Postgres would refuse anyway because
// Application.opportunityId is declared ON DELETE RESTRICT.
// ---------------------------------------------------------------------------

const TEST_PREFIX = "Test Research ";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

// Order matters. Reports point at companies and opportunities, so they go
// first. Deleting a parent row while a child still references it is the
// ordering mistake that only shows up once a foreign key stops cascading.
async function deleteTestData() {
  await prisma.researchReport.deleteMany({
    where: { company: { name: { startsWith: TEST_PREFIX } } },
  });

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
// Fixtures
//
// Everything a research report points at is created straight through Prisma
// rather than over HTTP. Those endpoints are not what this file tests, so a bug
// in POST /companies should not turn up as a failure here.
// ---------------------------------------------------------------------------

function testCompany(label: string) {
  return prisma.company.create({
    data: { name: testName(label) },
  });
}

function testOpportunity(label: string, companyId: string) {
  return prisma.opportunity.create({
    data: {
      title: testName(label),
      type: "INTERNSHIP",
      sourceUrl: "https://example.com/jobs/1",
      companyId,
    },
  });
}

// The rows the tests actually assert on. createdAt is accepted as an optional
// argument so the sorting test can name the two timestamps outright instead of
// depending on two writes landing in the right order milliseconds apart.
function testReport(
  companyId: string,
  reportType: "COMPANY_OVERVIEW" | "INTERVIEW_PREP" | "RECENT_NEWS",
  extra: { opportunityId?: string; createdAt?: Date } = {},
) {
  return prisma.researchReport.create({
    data: { companyId, reportType, ...extra },
  });
}

function idsOf(body: { id: string }[]) {
  return body.map((report) => report.id);
}

// ---------------------------------------------------------------------------
// What the responses contain
//
// The service selects a fixed preview of columns: id, reportType, companyId and
// opportunityId. contentMd, sources, status and the timestamps are not in it, so
// any test that checks those has to read the row back with Prisma rather than
// reading the response body. That is why several tests below make a request and
// then query the database.
// ---------------------------------------------------------------------------

describe("POST /research-reports", () => {
  it("creates a report and returns 201", async () => {
    const company = await testCompany("Created");

    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "COMPANY_OVERVIEW", companyId: company.id });

    expect(response.status).toBe(201);
    expect(response.body.reportType).toBe("COMPANY_OVERVIEW");
    expect(response.body.companyId).toBe(company.id);

    // A generated id proves the row really reached the database.
    expect(response.body.id).toBeDefined();
  });

  // A report can be about a company on its own, or tied to one specific
  // posting, which is what INTERVIEW_PREP normally is.
  it("stores the opportunity when one is given", async () => {
    const company = await testCompany("With Opportunity");
    const opportunity = await testOpportunity("With Opportunity", company.id);

    const response = await request(app).post("/research-reports").send({
      reportType: "INTERVIEW_PREP",
      companyId: company.id,
      opportunityId: opportunity.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.opportunityId).toBe(opportunity.id);
  });

  // The column is nullable, so a body without opportunityId has to produce null
  // rather than being rejected or storing something odd.
  it("leaves the opportunity null when none is given", async () => {
    const company = await testCompany("No Opportunity");

    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "RECENT_NEWS", companyId: company.id });

    expect(response.status).toBe(201);
    expect(response.body.opportunityId).toBeNull();
  });

  // The database defaults, seen through a real request. Creating a report only
  // queues the work: the AI step has not run yet, so the row starts empty apart
  // from its status. Getting this wrong would mean the UI showing research that
  // was never generated.
  it("starts a new report at PENDING with no content yet", async () => {
    const company = await testCompany("Pending");

    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "COMPANY_OVERVIEW", companyId: company.id });

    expect(response.status).toBe(201);

    const stored = await prisma.researchReport.findUnique({
      where: { id: response.body.id },
    });

    expect(stored?.status).toBe("PENDING");
    expect(stored?.contentMd).toBeNull();
    expect(stored?.sources).toBeNull();
    expect(stored?.model).toBeNull();
    expect(stored?.generatedAt).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // The security case for this module
  //
  // The end to end version of "strips the fields the AI step and the server own"
  // from the validation tests. It matters more here than in the user-owned
  // modules: a research report is shared, everybody looking at that company sees
  // the same row, and this route has no requireAuth in front of it. If contentMd
  // or sources survived validation, one anonymous caller could publish invented
  // research, or a link to a site they control, to every other user.
  // ---------------------------------------------------------------------------
  it("ignores content sent by the client", async () => {
    const company = await testCompany("Faked");

    const response = await request(app).post("/research-reports").send({
      reportType: "COMPANY_OVERVIEW",
      companyId: company.id,
      status: "COMPLETED",
      contentMd: "# Totally real research",
      sources: [{ url: "https://attacker.example.com" }],
      model: "some-model",
      banana: 7,
    });

    expect(response.status).toBe(201);
    expect(response.body.banana).toBeUndefined();

    const stored = await prisma.researchReport.findUnique({
      where: { id: response.body.id },
    });

    expect(stored?.status).toBe("PENDING");
    expect(stored?.contentMd).toBeNull();
    expect(stored?.sources).toBeNull();
    expect(stored?.model).toBeNull();
  });

  it("returns 400 when reportType is missing", async () => {
    const company = await testCompany("No Type");

    const response = await request(app)
      .post("/research-reports")
      .send({ companyId: company.id });

    expect(response.status).toBe(400);
  });

  it("returns 400 when companyId is missing", async () => {
    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "COMPANY_OVERVIEW" });

    expect(response.status).toBe(400);
  });

  // Without the enum check this string reaches Postgres, which rejects it
  // against the ReportType type and turns the client's typo into a 500.
  it("returns 400 when reportType is not one of the allowed values", async () => {
    const company = await testCompany("Bad Type");

    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "SALARY_GOSSIP", companyId: company.id });

    expect(response.status).toBe(400);
  });

  it("returns 400 when companyId is not a uuid", async () => {
    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "COMPANY_OVERVIEW", companyId: "not-a-uuid" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when opportunityId is not a uuid", async () => {
    const company = await testCompany("Bad Opportunity");

    const response = await request(app).post("/research-reports").send({
      reportType: "COMPANY_OVERVIEW",
      companyId: company.id,
      opportunityId: "not-a-uuid",
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /research-reports", () => {
  it("returns a list containing a created report", async () => {
    const company = await testCompany("Listed");
    const created = await testReport(company.id, "COMPANY_OVERVIEW");

    const response = await request(app)
      .get("/research-reports")
      .query({ page: 1, limit: 50 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // Checks that this specific report is present rather than checking the
    // array length, because other rows may exist in the database.
    expect(idsOf(response.body)).toContain(created.id);
  });

  it("returns at most limit reports", async () => {
    const company = await testCompany("Limit");

    await testReport(company.id, "COMPANY_OVERVIEW");
    await testReport(company.id, "RECENT_NEWS");

    const response = await request(app)
      .get("/research-reports")
      .query({ page: 1, limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
  });

  it("returns an empty list for a page past the end", async () => {
    const company = await testCompany("Paged");
    await testReport(company.id, "COMPANY_OVERVIEW");

    const response = await request(app)
      .get("/research-reports")
      .query({ companyId: company.id, limit: 1, page: 999 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // Adding companyId is what makes the filter tests deterministic. This list is
  // not scoped to a user, so an unfiltered response can contain rows this file
  // never created, and the exact set could not be asserted.
  it("returns only the reports for the company that was asked for", async () => {
    const wanted = await testCompany("Wanted");
    const other = await testCompany("Other");

    const mine = await testReport(wanted.id, "COMPANY_OVERVIEW");
    const theirs = await testReport(other.id, "COMPANY_OVERVIEW");

    const response = await request(app)
      .get("/research-reports")
      .query({ companyId: wanted.id });

    expect(response.status).toBe(200);

    const ids = idsOf(response.body);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it("returns only the reports of the type that was asked for", async () => {
    const company = await testCompany("Typed");

    const news = await testReport(company.id, "RECENT_NEWS");
    const prep = await testReport(company.id, "INTERVIEW_PREP");

    const response = await request(app)
      .get("/research-reports")
      .query({ companyId: company.id, reportType: "RECENT_NEWS" });

    expect(response.status).toBe(200);

    const ids = idsOf(response.body);
    expect(ids).toContain(news.id);
    expect(ids).not.toContain(prep.id);
  });

  // Both filters at once, because the service spreads them into a single Prisma
  // where clause and the two have to narrow together rather than one replacing
  // the other.
  it("applies the company and type filters together", async () => {
    const company = await testCompany("Both Filters");
    const other = await testCompany("Both Filters Other");

    const wanted = await testReport(company.id, "RECENT_NEWS");
    const wrongType = await testReport(company.id, "INTERVIEW_PREP");
    const wrongCompany = await testReport(other.id, "RECENT_NEWS");

    const response = await request(app)
      .get("/research-reports")
      .query({ companyId: company.id, reportType: "RECENT_NEWS" });

    expect(response.status).toBe(200);
    expect(idsOf(response.body)).toEqual([wanted.id]);

    // Named so the assertion above reads as a deliberate exclusion rather than
    // these two rows simply never having been created.
    expect(idsOf(response.body)).not.toContain(wrongType.id);
    expect(idsOf(response.body)).not.toContain(wrongCompany.id);
  });

  // Newest first, because the list is about the research that just ran.
  it("sorts by creation time, most recent first", async () => {
    const company = await testCompany("Ordered");

    const older = await testReport(company.id, "COMPANY_OVERVIEW", {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const newer = await testReport(company.id, "RECENT_NEWS", {
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .get("/research-reports")
      .query({ companyId: company.id });

    expect(response.status).toBe(200);
    expect(idsOf(response.body)).toEqual([newer.id, older.id]);
  });
});

// A malformed query string is the client's mistake, so it has to come back as
// 400. Without the schema, a negative page reaches Prisma and becomes a 500,
// which reads in the logs like a server defect.
describe("GET /research-reports validation", () => {
  it("returns 400 when page is below 1", async () => {
    const response = await request(app)
      .get("/research-reports")
      .query({ page: -5 });

    expect(response.status).toBe(400);
  });

  it("returns 400 when limit is above the maximum", async () => {
    const response = await request(app)
      .get("/research-reports")
      .query({ limit: 1000 });

    expect(response.status).toBe(400);
  });

  it("returns 400 when page is not a number", async () => {
    const response = await request(app)
      .get("/research-reports")
      .query({ page: "abc" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when reportType is not one of the allowed values", async () => {
    const response = await request(app)
      .get("/research-reports")
      .query({ reportType: "SALARY_GOSSIP" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when companyId is not a uuid", async () => {
    const response = await request(app)
      .get("/research-reports")
      .query({ companyId: "not-a-uuid" });

    expect(response.status).toBe(400);
  });
});

describe("GET /research-reports/:id", () => {
  it("returns the report when the id exists", async () => {
    const company = await testCompany("Findable");
    const created = await testReport(company.id, "INTERVIEW_PREP");

    const response = await request(app).get(`/research-reports/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.id);
    expect(response.body.reportType).toBe("INTERVIEW_PREP");
    expect(response.body.companyId).toBe(company.id);
  });

  it("returns 404 when the id is a valid uuid but no report has it", async () => {
    const response = await request(app).get(
      `/research-reports/${randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });

  // This is what researchReportIdRules buys. Postgres rejects a non uuid string
  // as a type error, so without the check this comes back as a 500.
  it("returns 400 when the id is not a uuid", async () => {
    const response = await request(app).get("/research-reports/not-a-uuid");

    expect(response.status).toBe(400);
  });
});

describe("DELETE /research-reports/:id", () => {
  it("removes the report and returns the row that was deleted", async () => {
    const company = await testCompany("Removable");
    const created = await testReport(company.id, "COMPANY_OVERVIEW");

    const response = await request(app).delete(
      `/research-reports/${created.id}`,
    );

    expect(response.status).toBe(204);
    expect(response.body.id).toBe(created.id);

    // The status code alone would only prove the request was accepted, so the
    // real proof is that the row can no longer be read back.
    const after = await request(app).get(`/research-reports/${created.id}`);
    expect(after.status).toBe(404);
  });

  // Deleting a report must not take the company or the posting with it. The
  // cascade in the schema runs the other way, from parent to child, and this is
  // the test that would catch it being written backwards.
  it("leaves the company and the opportunity in place", async () => {
    const company = await testCompany("Kept");
    const opportunity = await testOpportunity("Kept", company.id);
    const created = await testReport(company.id, "INTERVIEW_PREP", {
      opportunityId: opportunity.id,
    });

    await request(app).delete(`/research-reports/${created.id}`);

    const storedCompany = await prisma.company.findUnique({
      where: { id: company.id },
    });

    const storedOpportunity = await prisma.opportunity.findUnique({
      where: { id: opportunity.id },
    });

    expect(storedCompany).not.toBeNull();
    expect(storedOpportunity).not.toBeNull();
  });

  it("returns 400 when the id is not a uuid", async () => {
    const response = await request(app).delete("/research-reports/not-a-uuid");

    expect(response.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // This test currently fails, and that is the point of it
  //
  // The route has a 404 branch for a report that is not there, but that branch
  // can never run. deleteResearchReport calls prisma.researchReport.delete,
  // which throws instead of returning null when no row matches. Express 5 hands
  // a thrown error from an async handler to errorHandler, so the client gets a
  // generic 500 for what is really a missing row.
  //
  // The other modules avoid this by calling deleteMany and returning whether the
  // count was 1. See deleteApplication and deleteFitAnalysis.
  // ---------------------------------------------------------------------------
  it("returns 404 when the id is a valid uuid but no report has it", async () => {
    const response = await request(app).delete(
      `/research-reports/${randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });
});
