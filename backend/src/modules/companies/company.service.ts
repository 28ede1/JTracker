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

export function upsertCompanyByName(data: {
  name: string;
  industry?: string;
  websiteUrl?: string;
  logoUrl?: string;
}) {
  return prisma.company.upsert({
    // name is the unique column, so it is what the database checks against.
    where: { name: data.name },

    // Left empty so an import cannot overwrite details a user or the company
    // research feature already filled in with something better.
    update: {},
    create: data,
  });
}
