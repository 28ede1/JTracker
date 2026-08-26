import { describe, expect, it } from "vitest";

// describe, function used to group related tests
// it, defines an individual test
// expect, checks that the result is what you expect

import { newCompanyRules } from "./company.routes.ts";

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
