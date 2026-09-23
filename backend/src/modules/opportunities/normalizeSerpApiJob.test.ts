// ---------------------------------------------------------------------------
// Normalizer tests
//
// for testing how raw job data should be normalized
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { OpportunityType } from "../../../generated/prisma/enums.ts";
import { normalizeSerpApiJob } from "../opportunities/normalizeSerpApiJob.ts"

describe("normalizeSerpApiJob", () => {
  const job = {
    job_id: "job-123",
    title: "  Software Engineering Intern  ",
    company_name: "  Walmart Inc.  ",
    location: "  San Francisco, CA  ",
    via: "LinkedIn",
    thumbnail: "https://example.com/logo.png",
    description: "Build software.",
    apply_options: [{ title: "Test Careers", link: "https://example.com/apply" }],
  };

  it("normalizes a job with an external ID", () => {
    const result = normalizeSerpApiJob(job, OpportunityType.INTERNSHIP);

    expect(result).toMatchObject({
      title: "Software Engineering Intern",
      company: "Walmart",
      location: "San Francisco, CA",
      via: "LinkedIn",
      thumbnail: "https://example.com/logo.png",
      description: "Build software.",
      applicationUrl: "https://example.com/apply",
      opportunityType: OpportunityType.INTERNSHIP,
      job_id: "job-123",
      dedupKey: "serpapi:job-123",
      source: "SERPAPI",
    });
    expect(result?.lastSeenAt).toBeInstanceOf(Date);
  });

  it("creates a fallback deduplication key when the external ID is missing", () => {
    const result = normalizeSerpApiJob(
      { ...job, job_id: undefined },
      OpportunityType.INTERNSHIP,
    );

    expect(result?.dedupKey).toMatch(/^fallback:[a-f0-9]{64}$/);
  });

  it("returns null when a required field is missing", () => {
    expect(
      normalizeSerpApiJob(
        { ...job, title: undefined },
        OpportunityType.INTERNSHIP,
      ),
    ).toBeNull();

    expect(
      normalizeSerpApiJob(
        { ...job, company_name: undefined },
        OpportunityType.INTERNSHIP,
      ),
    ).toBeNull();

    expect(
      normalizeSerpApiJob(
        { ...job, apply_options: [] },
        OpportunityType.INTERNSHIP,
      ),
    ).toBeNull();
  });

  it("fills in defaults for optional fields", () => {
    const result = normalizeSerpApiJob(
      {
        job_id: "job-456",
        title: "Data Analyst Intern",
        company_name: "Walmart",
        apply_options: [{ title: "Test Careers", link: "https://example.com/other-apply" }],
      },
      OpportunityType.INTERNSHIP,
    );

    expect(result).toMatchObject({
      location: "Not specified",
      via: "",
      thumbnail: "",
      description: "",
    });
  });
});