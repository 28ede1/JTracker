// ---------------------------------------------------------------------------
// Research Report validation tests
//
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newResearchReportRules,
  researchReportQueryRules,
  researchReportIdRules,
} from "./research-report.validation.ts";

const COMPANY_ID = "550e8400-e29b-41d4-a716-446655440012";
const OPPORTUNITY_ID = "3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90";

describe("newResearchReportRules", () => {
  it("rejects an empty body", () => {
    const result = newResearchReportRules.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts a body with only the required fields", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "COMPANY_OVERVIEW",
      companyId: COMPANY_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      reportType: "COMPANY_OVERVIEW",
      companyId: COMPANY_ID,
    });
  });

  // opportunityId is optional because research can be about a company on its
  // own ("tell me about Stripe") or tied to one specific posting ("prep me for
  // this Stripe internship interview").
  it("accepts a body that also names an opportunity", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "INTERVIEW_PREP",
      companyId: COMPANY_ID,
      opportunityId: OPPORTUNITY_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      reportType: "INTERVIEW_PREP",
      companyId: COMPANY_ID,
      opportunityId: OPPORTUNITY_ID,
    });
  });

  // "optional" means the key may be missing, not that any value is allowed. A
  // missing key parses to undefined, and Prisma then leaves that column null.
  it("leaves opportunityId undefined when it is not sent", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "RECENT_NEWS",
      companyId: COMPANY_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.opportunityId).toBeUndefined();
  });

  it("rejects a body with no reportType", () => {
    const result = newResearchReportRules.safeParse({ companyId: COMPANY_ID });

    expect(result.success).toBe(false);
  });

  // companyId is what the report is anchored to. Without it there is no row to
  // attach the research to, so the request is meaningless rather than partial.
  it("rejects a body with no companyId", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "COMPANY_OVERVIEW",
    });

    expect(result.success).toBe(false);
  });

  // An enum is a fixed list of allowed values. Zod compares the incoming string
  // against that list exactly, so casing counts: "company_overview" is a
  // different string from "COMPANY_OVERVIEW" and is refused. Catching it here
  // turns a database type error into a plain 400.
  it("rejects a reportType that is not one of the allowed values", () => {
    expect(
      newResearchReportRules.safeParse({
        reportType: "SALARY_GOSSIP",
        companyId: COMPANY_ID,
      }).success,
    ).toBe(false);

    expect(
      newResearchReportRules.safeParse({
        reportType: "company_overview",
        companyId: COMPANY_ID,
      }).success,
    ).toBe(false);
  });

  it("rejects ids that are not in the right format", () => {
    expect(
      newResearchReportRules.safeParse({
        reportType: "COMPANY_OVERVIEW",
        companyId: "not-a-guid",
      }).success,
    ).toBe(false);

    expect(
      newResearchReportRules.safeParse({
        reportType: "COMPANY_OVERVIEW",
        companyId: COMPANY_ID,
        opportunityId: "not-a-guid",
      }).success,
    ).toBe(false);
  });

  // A JSON body can contain any type, not just strings. A number where an id
  // belongs has to be refused here, because Postgres rejects it as a type error
  // and that surfaces as a 500 for what is really the client's mistake.
  it("rejects ids that are not strings", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "COMPANY_OVERVIEW",
      companyId: 7,
    });

    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // The security behaviour of this schema
  //
  // Zod's z.object drops any key it was not told about, so the parsed value can
  // only ever contain reportType, companyId and opportunityId.
  //
  // That matters more here than in the user-owned modules. A research report is
  // shared reference data: everybody looking at that company sees the same row,
  // and these routes are mounted without requireAuth. If contentMd or sources
  // were accepted from a request body, one caller could publish invented
  // research, or a link to a site they control, to every other user. Leaving
  // those fields out of the schema is what makes that impossible rather than
  // merely discouraged.
  // ---------------------------------------------------------------------------
  it("strips the fields the AI step and the server own", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "COMPANY_OVERVIEW",
      companyId: COMPANY_ID,
      status: "COMPLETED",
      contentMd: "# Totally real research",
      sources: [{ url: "https://attacker.example.com" }],
      model: "some-model",
      generatedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      opportunityId: OPPORTUNITY_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      reportType: "COMPANY_OVERVIEW",
      companyId: COMPANY_ID,
      opportunityId: OPPORTUNITY_ID,
    });
  });
});

// Express hands over every query parameter as text, so each test feeds strings
// in and checks the parsed value that comes out.
describe("researchReportQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = researchReportQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

  // "coerce" means the rule converts before it checks. The string "2" becomes
  // the number 2, which matters because the service does arithmetic on page to
  // work out how many rows to skip, and "2" - 1 is not something to rely on.
  it("accepts every parameter and coerces the numbers", () => {
    const result = researchReportQueryRules.safeParse({
      page: "2",
      limit: "10",
      reportType: "RECENT_NEWS",
      companyId: COMPANY_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 2,
      limit: 10,
      reportType: "RECENT_NEWS",
      companyId: COMPANY_ID,
    });
  });

  it("rejects a page below 1", () => {
    expect(researchReportQueryRules.safeParse({ page: "0" }).success).toBe(
      false,
    );
    expect(researchReportQueryRules.safeParse({ page: "-5" }).success).toBe(
      false,
    );
  });

  // The ceiling is the reason this rule exists at all. Without it a client could
  // ask for a million rows in one request and make the database do that work.
  it("rejects a limit above the maximum", () => {
    expect(researchReportQueryRules.safeParse({ limit: "101" }).success).toBe(
      false,
    );
  });

  it("rejects a limit below 1", () => {
    expect(researchReportQueryRules.safeParse({ limit: "0" }).success).toBe(
      false,
    );
  });

  it("rejects a page that is not a whole number", () => {
    expect(researchReportQueryRules.safeParse({ page: "abc" }).success).toBe(
      false,
    );
    expect(researchReportQueryRules.safeParse({ page: "1.5" }).success).toBe(
      false,
    );
  });

  it("rejects a reportType that is not one of the allowed values", () => {
    expect(
      researchReportQueryRules.safeParse({ reportType: "SALARY_GOSSIP" })
        .success,
    ).toBe(false);
  });

  it("rejects a company id not in the right format", () => {
    expect(
      researchReportQueryRules.safeParse({ companyId: "not-a-guid" }).success,
    ).toBe(false);
  });

  // The service spreads these straight into a Prisma `where`. An undefined
  // filter is skipped by Prisma, which is how "no filter given" turns into "do
  // not narrow the list" instead of "match rows where companyId is null".
  it("leaves the filters undefined when they are not given", () => {
    const result = researchReportQueryRules.safeParse({ page: "1" });

    expect(result.success).toBe(true);
    expect(result.data?.reportType).toBeUndefined();
    expect(result.data?.companyId).toBeUndefined();
  });

  // A parameter that is not declared must never reach the service and become a
  // filter. opportunityId is a real column and a valid field on the POST body,
  // but it is deliberately not a filter here, so it has to be dropped rather
  // than quietly passed through to the query.
  it("strips parameters that are not in the schema", () => {
    const result = researchReportQueryRules.safeParse({
      page: "1",
      opportunityId: OPPORTUNITY_ID,
      banana: "7",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });
});

describe("researchReportIdRules", () => {
  it("accepts a uuid", () => {
    expect(researchReportIdRules.safeParse(COMPANY_ID).success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(researchReportIdRules.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(researchReportIdRules.safeParse("").success).toBe(false);
  });
});
