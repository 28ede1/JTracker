
import { describe, expect, it } from "vitest";
import { createOpportunityDedupeKey, setPreferredApplicationUrl } from "./opportunity.utils.ts";

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

describe("setPreferredApplicationUrl", () => {
  it("finds a company domain with jobs attached to its name", () => {
    const options = [
      { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/123" },
      { title: "Schwab Jobs", link: "https://www.schwabjobs.com/job/austin/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, "Charles Schwab"))
      .toBe(options[1].link);
  });
  
  it("finds a company name after a jobs subdomain", () => {
    const options = [
      { title: "Indeed", link: "https://www.indeed.com/viewjob?jk=123" },
      { title: "Cox Careers", link: "https://jobs.coxenterprises.com/en/jobs/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, "Cox"))
      .toBe(options[1].link);
  });
  
  it("finds a hyphenated company name in the domain", () => {
    const options = [
      { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/123" },
      { title: "Coca-Cola Careers", link: "https://careers.coca-cola.com/job/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, " Coca-Cola Incorporated "))
      .toBe(options[1].link);
  });
  
  it("finds a short company name in the domain", () => {
    const options = [
      { title: "Indeed", link: "https://www.indeed.com/viewjob?jk=123" },
      { title: "IBM Careers", link: "https://careers.ibm.com/job/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, "IBM"))
      .toBe(options[1].link);
  });
  
  it("chooses the matching company domain among several options", () => {
    const options = [
      { title: "General Motors Careers", link: "https://search-careers.gm.com/en/jobs/111" },
      { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/222" },
      { title: "Cox Careers", link: "https://jobs.coxenterprises.com/en/jobs/333" },
      { title: "Indeed", link: "https://www.indeed.com/viewjob?jk=444" },
    ];
  
    expect(setPreferredApplicationUrl(options, "Cox Enterprises"))
      .toBe(options[2].link);
  });
  
  it("prefers LinkedIn over Indeed when no company domain matches", () => {
    const options = [
      { title: "Indeed", link: "https://www.indeed.com/viewjob?jk=123" },
      { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, "IBM"))
      .toBe(options[1].link);
  });
  
  it("does not mistake the .com ending for a company match", () => {
    const options = [
      { title: "Indeed", link: "https://www.indeed.com/viewjob?jk=123" },
      { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, "Com"))
      .toBe(options[1].link);
  });
  
  it("falls back to the first option when nothing preferred matches", () => {
    const options = [
      { title: "JobLeads", link: "https://www.jobleads.com/us/job/123" },
      { title: "BeBee", link: "https://bebee.com/us/jobs/456" },
    ];
  
    expect(setPreferredApplicationUrl(options, "IBM"))
      .toBe(options[0].link);
  });
  
  it("returns undefined when there are no options", () => {
    expect(setPreferredApplicationUrl([], "IBM")).toBeUndefined();
    expect(setPreferredApplicationUrl(undefined, "IBM")).toBeUndefined();
  });
});