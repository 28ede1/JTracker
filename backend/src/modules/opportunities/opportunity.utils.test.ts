
import { describe, expect, it } from "vitest";
import { createOpportunityDedupeKey } from "./opportunity.utils.ts";

describe("createOpportunityDedupeKey", () => {
  const listing = {
    title: "Software Engineering Intern",
    company: "Walmart",
    location: "San Francisco, CA",
  };

  it("uses the external ID when one is available", () => {
    const key = createOpportunityDedupeKey({
      ...listing,
      externalId: "job-123",
    });

    expect(key).toBe("serpapi:job-123");
  });

  it("creates the same fallback key for the same listing", () => {
    const first = createOpportunityDedupeKey(listing);
    const second = createOpportunityDedupeKey(listing);

    expect(first).toMatch(/^fallback:[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("ignores capitalization and surrounding spaces in the fallback", () => {
    const first = createOpportunityDedupeKey(listing);
    const second = createOpportunityDedupeKey({
      title: "  software engineering intern  ",
      company: "  WALMART  ",
      location: "  san francisco, ca  ",
    });

    expect(second).toBe(first);
  });

  it("creates a different fallback key for a different title", () => {
    const first = createOpportunityDedupeKey(listing);
    const second = createOpportunityDedupeKey({
      ...listing,
      title: "Data Science Intern",
    });

    expect(second).not.toBe(first);
  });

  it("uses the fallback when the external ID is empty", () => {
    const key = createOpportunityDedupeKey({
      ...listing,
      externalId: "",
    });

    expect(key).toMatch(/^fallback:[a-f0-9]{64}$/);
  });
});