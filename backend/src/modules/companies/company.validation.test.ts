import { describe, expect, it } from "vitest";

// describe, function used to group related tests
// it, defines an individual test
// expect, checks that the result is what you expect

import { companyQueryRules, newCompanyRules } from "./company.validation.ts";

describe("newCompanyRules", () => {
  it("accepts a body with only a name", () => {
    const result = newCompanyRules.safeParse({ name: "Stripe" });

    expect(result.success).toBe(true);
  });

  it("accepts a body with every field", () => {
    const result = newCompanyRules.safeParse({
      name: "Stripe",
      domain: "stripe.com",
      industry: "Fintech",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a body with no name", () => {
    const result = newCompanyRules.safeParse({ domain: "stripe.com" });

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

  // This is the security behaviour, so it gets its own test. Fields not
  // declared in the schema must never reach the database.
  it("strips fields that are not in the schema", () => {
    const result = newCompanyRules.safeParse({ name: "Stripe", banana: 7 });

    expect(result.success).toBe(true);

    // The check has to be inside this branch, because result.data only exists
    // when success is true. TypeScript enforces that.
    if (result.success) {
      expect(result.data).toEqual({ name: "Stripe" });
    }
  });
});

// These run without a database or a server, because the rules are just a
// function over a plain object. That is the payoff for keeping them in their
// own file instead of inline in the route.
describe("companyQueryRules", () => {
  it("fills in defaults when no parameters are given", () => {
    const result = companyQueryRules.safeParse({});

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  // Express hands over strings, so this conversion is the whole reason
  // z.coerce is used instead of z.number.
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

  // A cleared search box sends q as an empty string. That must drop the filter
  // rather than fail the request.
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
