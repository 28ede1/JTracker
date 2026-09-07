// ---------------------------------------------------------------------------
// Resume validation tests
// 
// No database and no HTTP here. These call the rule sets directly, which is
// what makes them fast enough to run on every save. The route tests cover the
// same rules end to end, but only for the handful of cases worth paying a
// network round trip for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import { z } from "zod";

import { newResumeRules, resumeIdRules, resumeQueryRules } from "./resume.validation.ts";


const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("newResumeRules", () => {
    it("rejects an empty body", () => {
        const result = newResumeRules.safeParse({});

        expect(result.success).toBe(false);
    })

    it("accepts body with label with spaces trimmed", () => {
        const result = newResumeRules.safeParse({label: " 8_10_Resume "});

        expect(result.success).toBe(true);

        expect(result.data).toEqual({label:"8_10_Resume"})
    })

    it("accepts body with fields that need to be stripped", () => {
        const result = newResumeRules.safeParse({label: "8_10_Resume", age: 10});

        expect(result.success).toBe(true);

        expect(result.data).toEqual({label:"8_10_Resume"})
    })

    it("rejects body with label field in incorrect format", () => {
        const result = newResumeRules.safeParse({label: 8});

        expect(result.success).toBe(false);
    })  
})

describe("resumeIdRules", () => {
    it("accepts body with valid UUID", () => {
        const result = resumeIdRules.safeParse(VALID_ID)

        expect(result.success).toBe(true)
    })

    it("rejects bodu with invalid UUID", () => {
        const result = resumeIdRules.safeParse("invalid_id")

        expect(result.success).toBe(false)
    })
})

describe("resumeQueryRules", () => {
    it("fills in defaults when no parameters are given", () => {
      const result = resumeQueryRules.safeParse({});
  
      expect(result.success).toBe(true);
  
      expect(result.data).toEqual({
        page: 1,
        limit: 50,
      });
    });
  
    it("accepts every parameter", () => {
      const result = resumeQueryRules.safeParse({
        page: "2",
        limit: "10",
        label: " New Resume ",
      });
  
      expect(result.success).toBe(true);
  
      expect(result.data).toEqual({
        page: 2,
        limit: 10,
        label: "New Resume",
      });
    });
  
    it("rejects a page below 1", () => {
      expect(resumeQueryRules.safeParse({ page: "0" }).success).toBe(false);
      expect(resumeQueryRules.safeParse({ page: "-5" }).success).toBe(false);
    });
  
    it("rejects a limit above the maximum", () => {
      expect(resumeQueryRules.safeParse({ limit: "101" }).success).toBe(false);
    });
  
    it("rejects a page that is not a whole number", () => {
      expect(resumeQueryRules.safeParse({ page: "abc" }).success).toBe(false);
      expect(resumeQueryRules.safeParse({ page: "1.5" }).success).toBe(false);
    });
  
    it("rejects a label that is invalid", () => {
      expect(resumeQueryRules.safeParse({ label: 12 }).success).toBe(
        false,
      );
    });
  
    it("strips parameters that are not in the schema", () => {
      const result = resumeQueryRules.safeParse({
        page: "1",
        userId: "12",
        banana: "7",
      });
  
      expect(result.success).toBe(true);
  
      expect(result.data).toEqual({
        page: 1,
        limit: 50,
      });
    });
  });