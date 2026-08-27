// ---------------------------------------------------------------------------
// Opportunity service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a scraper or a test, not just by a web request.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";
import type { OpportunityType, WorkMode } from "../../../generated/prisma/enums.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";

type ListOpportunitiesOptions = {
  page: number;
  limit: number;
  q?: string;
  type?: OpportunityType;
  workMode?: WorkMode;
  companyId?: string;
  location?: string;
  isActive: boolean;
};

// Only the company fields the list actually shows. Selecting the whole row
// would send every column of every company on every page.
const companyPreview = {
  select: { id: true, name: true, logoUrl: true },
};

export function listOpportunities({
  page,
  limit,
  q,
  type,
  workMode,
  companyId,
  location,
  isActive,
}: ListOpportunitiesOptions) {
  const skip = (page - 1) * limit;

  return prisma.opportunity.findMany({
    // Prisma ignores any key whose value is undefined, so an absent filter
    // drops out of the query on its own.
    where: {
      isActive,
      type,
      workMode,
      companyId,
      title: q ? { contains: q, mode: "insensitive" } : undefined,

      // Free text in the database ("Remote", "New York, NY"), so this matches
      // part of it rather than the whole string.
      location: location ? { contains: location, mode: "insensitive" } : undefined,
    },

    // Newest first, since a feed is about what is open now. Rows with no
    // posting date go last instead of first, which is what Postgres would
    // otherwise do for a descending sort. The id breaks ties so paging never
    // shows or skips a row.
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    skip,
    take: limit,
    include: { company: companyPreview },
  });
}

export function findOpportunity(id: string) {
  return prisma.opportunity.findUnique({
    where: {
      id: id,
    },
    include: { company: companyPreview },
  });
}

export function createOpportunity(data: {
  type: OpportunityType;
  title: string;
  sourceUrl: string;
  description?: string;
  location?: string;
  workMode?: WorkMode;
  postedAt?: Date;
  deadlineAt?: Date;
  companyId?: string;
  details?: Prisma.InputJsonValue;
}) {
  return prisma.opportunity.create({ data });
}
