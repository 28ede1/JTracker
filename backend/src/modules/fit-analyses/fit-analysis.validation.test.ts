// ---------------------------------------------------------------------------
// Fit Analysis validation tests
//
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  newFitAnalysisRules,
  fitAnalysisQueryRules,
  fitAnalysisIdRules,
} from "./fit-analysis.validation.ts";

// Valid uuids reused across the tests, so a failure is never about the shape of
// an id when the test is about something else.
const RESUME_ID = "550e8400-e29b-41d4-a716-446655440000";
const OPPORTUNITY_ID = "3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90";
const OTHER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("newFitAnalysisRules", () => {
  it("rejects an empty body", () => {
    const result = newFitAnalysisRules.safeParse({});

    expect(result.success).toBe(false);
  });

  // Both ids are required, unlike an application where only the opportunity is.
  // A fit analysis compares one specific resume against one specific posting, so
  // there is no meaningful half-filled version of it.
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

  // A JSON body can contain any type, not just strings. A number where an id
  // belongs has to be refused here, because Postgres rejects it as a type error
  // and that surfaces as a 500 for what is really the client's mistake.
  it("rejects ids that are not strings", () => {
    const result = newFitAnalysisRules.safeParse({
      resumeId: 7,
      opportunityId: OPPORTUNITY_ID,
    });

    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // The security behaviour of this schema
  //
  // Zod's z.object drops any key it was not told about, so the parsed value can
  // only ever contain resumeId and opportunityId. That is what stops a client
  // from choosing who the analysis belongs to: userId never survives parsing,
  // and the route supplies it from the verified token instead.
  // ---------------------------------------------------------------------------
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

  // The other half of the same rule, and the one specific to this module. score,
  // summary, strengths, gaps, model and status are written by the AI step later,
  // never by the client. Leaving them out of the schema is what makes that
  // impossible rather than merely discouraged, so a client cannot post itself a
  // perfect score.
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

// Express hands over every query parameter as text, so each test feeds strings
// in and checks the parsed value that comes out.
describe("fitAnalysisQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = fitAnalysisQueryRules.safeParse({});

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      page: 1,
      limit: 50,
    });
  });

  // "coerce" means the rule converts before it checks. The string "2" becomes
  // the number 2, which matters because the service does arithmetic on page to
  // work out how many rows to skip, and "2" - 1 is not something to rely on.
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

  // The ceiling is the reason this rule exists at all. Without it a client could
  // ask for a million rows in one request and make the database do that work.
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

  // A parameter that is not declared must never reach the service and become a
  // filter. userId is the one that matters: a client must not be able to ask for
  // someone else's fit analyses by adding it to the query string.
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
