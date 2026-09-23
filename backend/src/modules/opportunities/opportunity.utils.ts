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