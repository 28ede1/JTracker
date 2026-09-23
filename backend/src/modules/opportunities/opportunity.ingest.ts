// ---------------------------------------------------------------------------
// Opportunity ingestion
//
// Runs the import end to end: ask SerpAPI for listings, normalize each one,
// and store it. Started by a scheduled job
// ---------------------------------------------------------------------------

import { fetchSerpApiJobs, type SerpApiJob } from "../../lib/serpapi.ts";
import { OpportunityType } from "../../../generated/prisma/enums.ts";
import { upsertCompanyByName } from "../companies/company.service.ts";
import { normalizeSerpApiJob } from "./normalizeSerpApiJob.ts";
import { upsertOpportunityFromSource } from "./opportunity.service.ts";

export type IngestionSummary = {
  fetched: number;
  skipped: number;
  saved: number;
  failed: number;
};

type FetchJobs = () => Promise<SerpApiJob[]>;

export async function ingestSerpApiOpportunities(
  fetchJobs: FetchJobs = fetchSerpApiJobs,
): Promise<IngestionSummary> {
  const jobs = await fetchJobs();

  const summary: IngestionSummary = {
    fetched: jobs.length,
    skipped: 0,
    saved: 0,
    failed: 0,
  };

  for (const job of jobs) {
    const normalized = normalizeSerpApiJob(job, OpportunityType.INTERNSHIP);

    // The normalizer returns null for a listing with no title, company or
    // application link, which is not worth storing.
    if (!normalized) {
      summary.skipped++;
      continue;
    }

    try {
      // A listing names its company, but Opportunity.companyId needs a stored
      // row, so the company is saved first and its id is used below.
      const company = await upsertCompanyByName({
        name: normalized.company,
        logoUrl: normalized.thumbnail || undefined,
      });

      await upsertOpportunityFromSource({
        dedupKey: normalized.dedupKey,
        lastSeenAt: normalized.lastSeenAt,
        source: normalized.source,
        externalId: normalized.job_id,
        type: normalized.opportunityType,
        title: normalized.title,
        sourceUrl: normalized.applicationUrl,
        description: normalized.description || undefined,
        location: normalized.location,
        companyId: company.id,

        // "via" is the board the listing was seen on, such as LinkedIn. It has
        // no column of its own, so it goes in the details JSON.
        details: normalized.via ? { via: normalized.via } : undefined,
      });

      summary.saved++;
    } catch (error) {
      // One bad listing must not end the whole run, so the failure is counted
      // and the loop carries on with the next one.
      summary.failed++;
      console.error(`Could not import "${normalized.title}":`, error);
    }
  }

  return summary;
}
