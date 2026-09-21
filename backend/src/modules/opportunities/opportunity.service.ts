// ---------------------------------------------------------------------------
// Opportunity service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked.
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

// Only the company fields the list actually shows.
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
    // Prisma ignores a key whose value is undefined, so a filter the client did
    // not send drops out of the query on its own.
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

    // Newest first. Rows with no posting date go last rather than first, which
    // is what Postgres would otherwise do on a descending sort.
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
