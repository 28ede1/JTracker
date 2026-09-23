// ---------------------------------------------------------------------------
// Normalizer for SerpAPI Data
//
// This file takes raw job data returned from the SerpAPI call
// and normalizes the resulting data to be injested by the backend.
// ---------------------------------------------------------------------------


import type { SerpApiJob } from "../../lib/serpapi.ts";
import { OpportunityType } from "../../../generated/prisma/enums.ts";
import { normalizeCompanyName} from "../companies/company.utils.ts"
import { createOpportunityDedupeKey } from "./opportunity.utils.ts"

export function normalizeSerpApiJob(job: SerpApiJob, opportunityType: OpportunityType) {
  const applicationUrl = job.apply_options?.[0]?.link;

  if ( !job.title || !job.company_name || !applicationUrl) {
    return null;
  }

  const title = job.title.trim();
  const company = normalizeCompanyName(job.company_name);
  const location = job.location?.trim() ?? "Not specified";

  const dedupeKey = createOpportunityDedupeKey({
    externalId: job.job_id,
    title,
    company,
    location,
  });

  return {
    title: title,
    company: company,
    location: location,
    via: job.via ?? "",
    thumbnail: job.thumbnail ?? "",
    description: job.description ?? "",
    applicationUrl,
    opportunityType: opportunityType,
    job_id: job.job_id,

    // Identifies the listing so it is not inserted twice.
    dedupKey: dedupeKey,

    // Useful for knowing where JTracker obtained the listing.
    source: "SERPAPI",

    // Useful later when deciding whether a listing is old.
    lastSeenAt: new Date(),
  };
}
