// ---------------------------------------------------------------------------
// Company service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";

type ListCompaniesOptions = {
  page: number;
  limit: number;
  q?: string;
};

export function listCompanies({ page, limit, q }: ListCompaniesOptions) {
  const skip = (page - 1) * limit;

  return prisma.company.findMany({
    // "insensitive" is what lets a search for "stripe" find "Stripe".
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
  industry?: string;
  websiteUrl?: string;
  logoUrl?: string;
}) {
  return prisma.company.create({ data });
}
