import { describe, expect, it } from "vitest";

import { newOpportunityRules, opportunityQueryRules, opportunityIdRules } from './opportunity.validation.ts';

describe("newOpportunityRules", () => {
    it("rejects an empty body", () => {
        const result = newOpportunityRules.safeParse({});
        
        expect(result.success).toBe(false)
    });

    it("accepts body with every field and coerces dates", () => {
        const result = newOpportunityRules.safeParse({
            type: "INTERNSHIP",
            title: "Test opportunity",
            description: "Test description",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship",
            location: "San Francisco, CA",
            workMode: "ONSITE",
            postedAt: "2026-08-01T12:00:00.000Z",
            deadlineAt: "2026-09-30T23:59:59.000Z",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            details: {
                hourlyPay: 50,
                season: "fall",
                numberApplicants: 100
            }
        });
        
        expect(result.success).toBe(true)

        expect(result.data).toEqual({
            type: "INTERNSHIP",
            title: "Test opportunity",
            description: "Test description",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship",
            location: "San Francisco, CA",
            workMode: "ONSITE",
            postedAt: new Date("2026-08-01T12:00:00.000Z"),
            deadlineAt: new Date("2026-09-30T23:59:59.000Z"),
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            details: {
                hourlyPay: 50,
                season: "fall",
                numberApplicants: 100
            }
        })
        
    });

    it("accepts body with only required fields", () => {
        const result = newOpportunityRules.safeParse({
            type: "INTERNSHIP",
            title: "Test opportunity",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship"
        });
        
        expect(result.success).toBe(true)
    });

    it("rejects body with one missing required field", () => {
        const result = newOpportunityRules.safeParse({
            type: "INTERNSHIP",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship"
        });
        
        expect(result.success).toBe(false)
    });

    it("rejects body with type field that is not part of the allowed enums", () => {
        const result = newOpportunityRules.safeParse({
            type: "project",
            title: "Test opportunity",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship"
        });
        
        expect(result.success).toBe(false)
    });

    it("rejects body with workmode field that is not part of the allowed enums", () => {
        const result = newOpportunityRules.safeParse({
            type: "INTERNSHIP",
            title: "Test opportunity",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship",
            workMode: "irl"
        });
        
        expect(result.success).toBe(false)
    });

    it("rejects body with company id not in the right format", () => {
        const result = newOpportunityRules.safeParse({
            type: "INTERNSHIP",
            title: "Test opportunity",
            sourceUrl: "https://example.com/opportunities/software-engineering-internship",
            workMode: "irl",
            companyId: "not-a-guid"
        });
        
        expect(result.success).toBe(false)
    });
})

// Express hands over every query parameter as text, so each test feeds strings
// in and checks the parsed value that comes out.
describe("opportunityQueryRules", () => {
    it("fills in defaults when no parameters are given", () => {
        const result = opportunityQueryRules.safeParse({});

        expect(result.success).toBe(true)

        // The defaults are what an unfiltered feed request turns into, so all
        // three are checked together.
        expect(result.data).toEqual({
            page: 1,
            limit: 50,
            isActive: true
        })
    });

    it("accepts every parameter and coerces the numbers", () => {
        const result = opportunityQueryRules.safeParse({
            page: "2",
            limit: "10",
            q: "engineer",
            type: "INTERNSHIP",
            workMode: "REMOTE",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            location: "San Francisco, CA",
            isActive: "false"
        });

        expect(result.success).toBe(true)

        expect(result.data).toEqual({
            page: 2,
            limit: 10,
            q: "engineer",
            type: "INTERNSHIP",
            workMode: "REMOTE",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            location: "San Francisco, CA",
            isActive: false
        })
    });

    it("rejects a page below 1", () => {
        expect(opportunityQueryRules.safeParse({ page: "0" }).success).toBe(false)
        expect(opportunityQueryRules.safeParse({ page: "-5" }).success).toBe(false)
    });

    it("rejects a limit above the maximum", () => {
        expect(opportunityQueryRules.safeParse({ limit: "101" }).success).toBe(false)
    });

    it("rejects a page that is not a whole number", () => {
        expect(opportunityQueryRules.safeParse({ page: "abc" }).success).toBe(false)
        expect(opportunityQueryRules.safeParse({ page: "1.5" }).success).toBe(false)
    });

    it("trims the search term", () => {
        const result = opportunityQueryRules.safeParse({ q: "  engineer  " });

        expect(result.success).toBe(true)
        expect(result.data?.q).toBe("engineer")
    });

    // A cleared search box sends q as an empty string. That must drop the
    // filter rather than fail the request.
    it("treats an empty search term as no search", () => {
        const result = opportunityQueryRules.safeParse({ q: "" });

        expect(result.success).toBe(true)
        expect(result.data?.q).toBeUndefined()
    });

    it("rejects a search term that is too long", () => {
        expect(opportunityQueryRules.safeParse({ q: "a".repeat(101) }).success).toBe(false)
    });

    it("rejects a type that is not part of the allowed enums", () => {
        expect(opportunityQueryRules.safeParse({ type: "project" }).success).toBe(false)
    });

    it("rejects a workMode that is not part of the allowed enums", () => {
        expect(opportunityQueryRules.safeParse({ workMode: "irl" }).success).toBe(false)
    });

    it("rejects a company id not in the right format", () => {
        expect(opportunityQueryRules.safeParse({ companyId: "not-a-guid" }).success).toBe(false)
    });

    it("trims the location", () => {
        const result = opportunityQueryRules.safeParse({ location: "  Remote  " });

        expect(result.success).toBe(true)
        expect(result.data?.location).toBe("Remote")
    });

    // This is the case z.coerce.boolean would get wrong, since any non-empty
    // string is truthy. Closed postings stay hidden unless they are asked for.
    it("reads isActive=false as the boolean false", () => {
        const result = opportunityQueryRules.safeParse({ isActive: "false" });

        expect(result.success).toBe(true)
        expect(result.data?.isActive).toBe(false)
    });

    it("reads isActive=true as the boolean true", () => {
        const result = opportunityQueryRules.safeParse({ isActive: "true" });

        expect(result.success).toBe(true)
        expect(result.data?.isActive).toBe(true)
    });

    // Only the two literal strings are allowed, so a typo becomes a 400 instead
    // of silently showing the wrong half of the feed.
    it("rejects isActive values other than the two literal strings", () => {
        expect(opportunityQueryRules.safeParse({ isActive: "1" }).success).toBe(false)
        expect(opportunityQueryRules.safeParse({ isActive: "yes" }).success).toBe(false)
        expect(opportunityQueryRules.safeParse({ isActive: "" }).success).toBe(false)
    });

    // This is the security behaviour. A parameter that is not declared must
    // never reach the service and become a filter.
    it("strips parameters that are not in the schema", () => {
        const result = opportunityQueryRules.safeParse({ page: "1", banana: "7" });

        expect(result.success).toBe(true)

        expect(result.data).toEqual({
            page: 1,
            limit: 50,
            isActive: true
        })
    });
});

describe("opportunityIdRules", () => {
    it("rejects a non-uuid string", () => {
      expect(opportunityIdRules.safeParse("not-a-uuid").success).toBe(false);
    });
  
    it("accepts a uuid", () => {
      expect(opportunityIdRules.safeParse("3f1c1b2e-9a4d-4f0e-8b3a-2c5d6e7f8a90").success).toBe(true);
    });
});
