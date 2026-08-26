// ---------------------------------------------------------------------------
// Company service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a scraper or a test, not just by a web request.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";

// One object instead of three positional arguments. listCompanies(1, 50, "x")
// only reads correctly if you remember the order, and a fourth filter later
// would change every call site.
type ListCompaniesOptions = {
  page: number;
  limit: number;
  q?: string;
};

export function listCompanies({ page, limit, q }: ListCompaniesOptions) {
  const skip = (page - 1) * limit;

  return prisma.company.findMany({
    // No search term means no where clause at all, which returns everything.
    // "insensitive" is what makes searching "stripe" find "Stripe".
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    skip,
    take: limit,
  });
}

export function findCompany(id: string) {
  return prisma.company.findUnique({
    where: {
      id: id,
    },
  })
}

export function createCompany(data: {
  name: string;
  domain?: string;
  industry?: string;
  websiteUrl?: string;
  logoUrl?: string;
}) {
  return prisma.company.create({ data });
}
