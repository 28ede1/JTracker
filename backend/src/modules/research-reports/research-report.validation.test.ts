// ---------------------------------------------------------------------------
// Research Report validation tests
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

  it("rejects a body with no companyId", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "COMPANY_OVERVIEW",
    });

    expect(result.success).toBe(false);
  });

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

  it("rejects ids that are not strings", () => {
    const result = newResearchReportRules.safeParse({
      reportType: "COMPANY_OVERVIEW",
      companyId: 7,
    });

    expect(result.success).toBe(false);
  });

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

describe("researchReportQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = researchReportQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

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

  // Without a ceiling a client could ask for a million rows in one request.
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

  it("leaves the filters undefined when they are not given", () => {
    const result = researchReportQueryRules.safeParse({ page: "1" });

    expect(result.success).toBe(true);
    expect(result.data?.reportType).toBeUndefined();
    expect(result.data?.companyId).toBeUndefined();
  });

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
