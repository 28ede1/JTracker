// ---------------------------------------------------------------------------
// Fit Analysis validation tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newFitAnalysisRules,
  fitAnalysisQueryRules,
  fitAnalysisIdRules,
} from "./fit-analysis.validation.ts";

const RESUME_ID = "550e8400-e29b-41d4-a716-446655440000";
const OPPORTUNITY_ID = "3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90";
const OTHER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("newFitAnalysisRules", () => {
  it("rejects an empty body", () => {
    const result = newFitAnalysisRules.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts a body with both ids", () => {
    const result = newFitAnalysisRules.safeParse({
      resumeId: RESUME_ID,
      opportunityId: OPPORTUNITY_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      resumeId: RESUME_ID,
      opportunityId: OPPORTUNITY_ID,
    });
  });

  it("rejects a body with only the resume", () => {
    const result = newFitAnalysisRules.safeParse({ resumeId: RESUME_ID });

    expect(result.success).toBe(false);
  });

  it("rejects a body with only the opportunity", () => {
    const result = newFitAnalysisRules.safeParse({
      opportunityId: OPPORTUNITY_ID,
    });

    expect(result.success).toBe(false);
  });

  it("rejects ids that are not in the right format", () => {
    expect(
      newFitAnalysisRules.safeParse({
        resumeId: "not-a-uuid",
        opportunityId: OPPORTUNITY_ID,
      }).success,
    ).toBe(false);

    expect(
      newFitAnalysisRules.safeParse({
        resumeId: RESUME_ID,
        opportunityId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects ids that are not strings", () => {
    const result = newFitAnalysisRules.safeParse({
      resumeId: 7,
      opportunityId: OPPORTUNITY_ID,
    });

    expect(result.success).toBe(false);
  });

  it("strips a userId sent in the body", () => {
    const result = newFitAnalysisRules.safeParse({
      resumeId: RESUME_ID,
      opportunityId: OPPORTUNITY_ID,
      userId: OTHER_ID,
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      resumeId: RESUME_ID,
      opportunityId: OPPORTUNITY_ID,
    });
  });

  it("strips the fields the AI step owns", () => {
    const result = newFitAnalysisRules.safeParse({
      resumeId: RESUME_ID,
      opportunityId: OPPORTUNITY_ID,
      status: "COMPLETED",
      score: 100,
      summary: "A perfect match.",
      strengths: ["everything"],
      gaps: [],
      model: "some-model",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      resumeId: RESUME_ID,
      opportunityId: OPPORTUNITY_ID,
    });
  });
});

describe("fitAnalysisQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = fitAnalysisQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

  it("accepts both parameters and coerces the numbers", () => {
    const result = fitAnalysisQueryRules.safeParse({
      page: "2",
      limit: "10",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 2,
      limit: 10,
    });
  });

  it("rejects a page below 1", () => {
    expect(fitAnalysisQueryRules.safeParse({ page: "0" }).success).toBe(false);
    expect(fitAnalysisQueryRules.safeParse({ page: "-5" }).success).toBe(false);
  });

  // Without a ceiling a client could ask for a million rows in one request.
  it("rejects a limit above the maximum", () => {
    expect(fitAnalysisQueryRules.safeParse({ limit: "101" }).success).toBe(
      false,
    );
  });

  it("rejects a limit below 1", () => {
    expect(fitAnalysisQueryRules.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects a page that is not a whole number", () => {
    expect(fitAnalysisQueryRules.safeParse({ page: "abc" }).success).toBe(false);
    expect(fitAnalysisQueryRules.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("strips parameters that are not in the schema", () => {
    const result = fitAnalysisQueryRules.safeParse({
      page: "1",
      userId: OTHER_ID,
      banana: "7",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });
});

describe("fitAnalysisIdRules", () => {
  it("accepts a uuid", () => {
    expect(fitAnalysisIdRules.safeParse(RESUME_ID).success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(fitAnalysisIdRules.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(fitAnalysisIdRules.safeParse("").success).toBe(false);
  });
});
