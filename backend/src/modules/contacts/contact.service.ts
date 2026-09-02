// ---------------------------------------------------------------------------
// Contact service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a scraper or a test, not just by a web request.
//
// Every function takes userId first, and every query filters by it. Contacts
// are the first thing in the app that belongs to one person rather than to
// everybody, so that argument is not a convenience: it is the line between the
// two.
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

// Only the company fields the list actually shows. Selecting the whole row
// would send every column of every company on every page.
const companyPreview = {
  select: { id: true, name: true, logoUrl: true },
};

// userId is a separate argument rather than part of the options object on
// purpose. Options come from the query string and are the caller's wish list;
// userId comes from the verified token and is not negotiable. Keeping them
// apart makes it impossible to write ...req.query and accidentally let a client
// choose whose contacts to read.
export function listContacts(
  userId: string,
  { page, limit, q, relationship, companyId }: ListContactsOptions,
) {
  const skip = (page - 1) * limit;

  return prisma.contact.findMany({
    // Prisma ignores any key whose value is undefined, so an absent filter
    // drops out of the query on its own. userId is the one filter that is
    // always present, which is what makes this line the privacy boundary.
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

    // Oldest first, so that users can be aware of who they haven't contacted in a while
    orderBy: [{ lastContactedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    skip,
    take: limit,
    include: { company: companyPreview },
  });
}

// findFirst instead of findUnique because the lookup is no longer by id alone.
// findUnique only accepts unique fields, and "id and owner together" is not a
// unique index, so this is the query that expresses "this row, and only if it
// is yours". A row owned by someone else comes back as null.
export function findContact(userId: string, id: string) {
  return prisma.contact.findFirst({
    where: {
      id: id,
      userId: userId,
    },
    include: { company: companyPreview },
  });
}

// userId is spread in last, after the validated data, so it cannot be
// overwritten by a field that arrived in the request. The order of those two
// lines is the entire guarantee that a client cannot file a contact under
// somebody else's account.
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
