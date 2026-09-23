// ---------------------------------------------------------------------------
// Research Report route tests
//
// The whole path end to end: a real HTTP request, through the validation rules
// and the service, to the real database and back. supertest drives the app
// object directly, so nothing has to listen on a port. No sign-in step, because
// the router is mounted without requireAuth and every request below is
// anonymous.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

const TEST_PREFIX = "Test Research ";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

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

beforeAll(deleteTestData);

afterEach(deleteTestData);

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

describe("POST /research-reports", () => {
  it("creates a report and returns 201", async () => {
    const company = await testCompany("Created");

    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "COMPANY_OVERVIEW", companyId: company.id });

    expect(response.status).toBe(201);
    expect(response.body.reportType).toBe("COMPANY_OVERVIEW");
    expect(response.body.companyId).toBe(company.id);

    expect(response.body.id).toBeDefined();
  });

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

  it("leaves the opportunity null when none is given", async () => {
    const company = await testCompany("No Opportunity");

    const response = await request(app)
      .post("/research-reports")
      .send({ reportType: "RECENT_NEWS", companyId: company.id });

    expect(response.status).toBe(201);
    expect(response.body.opportunityId).toBeNull();
  });

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

    expect(idsOf(response.body)).not.toContain(wrongType.id);
    expect(idsOf(response.body)).not.toContain(wrongCompany.id);
  });

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

    const after = await request(app).get(`/research-reports/${created.id}`);
    expect(after.status).toBe(404);
  });

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

  it("returns 404 when the id is a valid uuid but no report has it", async () => {
    const response = await request(app).delete(
      `/research-reports/${randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });
});
