// ---------------------------------------------------------------------------
// Company validation tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import { companyQueryRules, newCompanyRules } from "./company.validation.ts";

describe("newCompanyRules", () => {
  it("accepts a body with only a name", () => {
    const result = newCompanyRules.safeParse({ name: "Stripe" });

    expect(result.success).toBe(true);
  });

  it("accepts a body with every field (name, industry, websiteUrl, logoUrl", () => {
    const result = newCompanyRules.safeParse({
      name: "Stripe",
      industry: "Fintech",
      websiteUrl: "https://example.com",
      logoUrl: "https://example.com/logo.png",
    });

    expect(result.success).toBe(true);

    expect(result.data).toEqual({
      name: "Stripe",
      industry: "Fintech",
      websiteUrl: "https://example.com",
      logoUrl: "https://example.com/logo.png",
    });
  });

  it("strips any fields that are not permitted", () => {
    const result = newCompanyRules.safeParse({
      name: "Stripe",
      industry: "Fintech",
      websiteUrl: "https://example.com",
      logoUrl: "https://example.com/logo.png",
      notAField: 2
    });

    expect(result.success).toBe(true);
    
    expect(result.data).toEqual({
      name: "Stripe",
      industry: "Fintech",
      websiteUrl: "https://example.com",
      logoUrl: "https://example.com/logo.png",
    });

  });

  it("rejects an empty name", () => {
    const result = newCompanyRules.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a body with no name", () => {
    const result = newCompanyRules.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = newCompanyRules.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a name that is not a string", () => {
    const result = newCompanyRules.safeParse({ name: 12345 });

    expect(result.success).toBe(false);
  });

  it("strips fields that are not in the schema", () => {
    const result = newCompanyRules.safeParse({ name: "Stripe", banana: 7 });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({ name: "Stripe" });
    }
  });
});

describe("companyQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = companyQueryRules.safeParse({});

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it("converts numeric text into numbers", () => {
    const result = companyQueryRules.safeParse({ page: "2", limit: "10" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it("rejects a page below 1", () => {
    expect(companyQueryRules.safeParse({ page: "0" }).success).toBe(false);
    expect(companyQueryRules.safeParse({ page: "-5" }).success).toBe(false);
  });

  // Without a ceiling a client could ask for the whole table in one request.
  it("rejects a limit above the maximum", () => {
    expect(companyQueryRules.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects a page that is not a number", () => {
    expect(companyQueryRules.safeParse({ page: "abc" }).success).toBe(false);
  });

  it("rejects a fractional page", () => {
    expect(companyQueryRules.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("trims the search term", () => {
    const result = companyQueryRules.safeParse({ q: "  stripe  " });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.q).toBe("stripe");
    }
  });

  it("treats an empty search term as no search", () => {
    const result = companyQueryRules.safeParse({ q: "" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.q).toBeUndefined();
    }
  });

  it("rejects a search term that is too long", () => {
    const result = companyQueryRules.safeParse({ q: "a".repeat(101) });

    expect(result.success).toBe(false);
  });

  it("strips parameters that are not in the schema", () => {
    const result = companyQueryRules.safeParse({ page: "1", banana: "7" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({ page: 1, limit: 50 });
    }
  });
});
