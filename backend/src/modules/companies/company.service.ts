// ---------------------------------------------------------------------------
// Company service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a scraper or a test, not just by a web request.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts";

export function listCompanies() {
  return prisma.company.findMany({
    orderBy: { name: "asc" },
    take: 50,
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
}) {
  return prisma.company.create({ data });
}
