// ---------------------------------------------------------------------------
// Contact service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked. Contacts belong to one person, so every
// function takes userId first and every query filters by it.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";
import type { ContactRelationship } from "../../../generated/prisma/enums.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";

type ListContactsOptions = {
  page: number;
  limit: number;
  q?: string;
  relationship?: ContactRelationship;
  companyId?: string;
};

const companyPreview = {
  select: { id: true, name: true, logoUrl: true },
};

export function listContacts(
  userId: string,
  { page, limit, q, relationship, companyId }: ListContactsOptions,
) {
  const skip = (page - 1) * limit;

  return prisma.contact.findMany({
    where: {
      userId,
      relationship,
      companyId,

      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              {
                company: {
                  name: { contains: q, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    },

    // Oldest contact first, so the people going cold surface at the top. The id
    // breaks ties so paging never shows or skips a row.
    orderBy: [{ lastContactedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    skip,
    take: limit,
    include: { company: companyPreview },
  });
}

// findFirst, because "this row, and only if it is yours" is not a unique index
// and findUnique only accepts unique fields. Someone else's row comes back as
// null, which is what lets the route answer 404 without revealing the id.
export function findContact(userId: string, id: string) {
  return prisma.contact.findFirst({
    where: {
      id: id,
      userId: userId,
    },
    include: { company: companyPreview },
  });
}

export function createContact(
  userId: string,
  data: {
    firstName: string,
    lastName?: string,
    title?: string,
    email?: string,
    phone?: string,
    linkedinUrl?: string,
    relationship: ContactRelationship,
    notes?: string,
    lastContactedAt?: Date,
    nextFollowUpAt?: Date,
    companyId?: string
}) {
  return prisma.contact.create({ data: {...data, userId} });
}
