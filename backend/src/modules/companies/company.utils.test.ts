// ---------------------------------------------------------------------------
// Company utils unit tests
//
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "./company.utils.ts";

describe("normalizeCompanyName", () => {
  it("normalizes a company name", () => {
    const result = normalizeCompanyName("Stripe, Inc.");

    expect(result).toBe("Stripe");
  });

  it("removes extra spaces", () => {
    const result = normalizeCompanyName("  Google LLC  ");

    expect(result).toBe("Google");
  });

  it("normalizes capitalization", () => {
    const result = normalizeCompanyName("MICROSOFT");

    expect(result).toBe("Microsoft");
  });

  it("remove The and Company", () => {
    const result = normalizeCompanyName("The Coca-Cola Company");

    expect(result).toBe("Coca-cola");
  });

});