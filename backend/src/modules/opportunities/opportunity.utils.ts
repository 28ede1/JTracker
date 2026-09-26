// ---------------------------------------------------------------------------
// Company utilities
//
// Used for the normalization process of SerpAPI job data
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

type DedupeInput = {
  externalId?: string;
  title: string;
  company: string;
  location: string;
};

export function createOpportunityDedupeKey(input: DedupeInput): string {
  if (input.externalId) {
    return `serpapi:${input.externalId}`;
  }

  const fingerprint = [
    input.company.toLowerCase().trim(),
    input.title.toLowerCase().trim(),
    input.location.toLowerCase().trim(),
  ].join("|");

  const hash = createHash("sha256")
    .update(fingerprint)
    .digest("hex");

  return `fallback:${hash}`;
}

// for prioritizing application links that look company specific
function looksLikeCompanyDomain(
  link: string,
  companyName: string
): boolean {
  let hostname: string;

  try {
    hostname = new URL(link).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return false;
  }

  const domainParts = hostname.split(".");
  domainParts.pop(); // Remove the ending, such as "com".

  const companyWords = companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);

  return companyWords.some((word) => domainParts.join(".").includes(word));
}

// preferred application urls should be recognizable ones like linkedin, ashby, greenhouse, etc over not standard ones
// preference labels based on how SerpAPI currently returns array of apply options
export function setPreferredApplicationUrl(
  applyOptions: Array<{ title: string; link: string }> | undefined,
  companyName: string,
  
) {
  if (!applyOptions?.length) return undefined;

  const preferred_portals = [ "workday", "linkedin", "greenhouse", "lever", "ashby", "indeed", "glassdoor", "jobright", "ziprecruiter"];

  for (const option of applyOptions) {
    if (looksLikeCompanyDomain(option.link, companyName)) {
      return option.link;
    }
  };
   
  for (const portal of preferred_portals) {
    const match = applyOptions.find((option) =>
      option.title.toLowerCase().includes(portal)
    );
  
    if (match) {
      return match.link;
    }
  }

  return applyOptions[0]?.link;
}