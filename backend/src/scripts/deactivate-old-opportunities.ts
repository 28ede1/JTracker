// ---------------------------------------------------------------------------
// Opportunity 'deactivation' script
//
// Sets "isActive" attribute to false for old applications (applications with
// createdAt attribute > 30 days ago)
//
// ---------------------------------------------------------------------------


import { prisma } from "../lib/prisma.ts";
import "dotenv/config";

const maxAgeDays = 30;
const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

try {
  const result = await prisma.opportunity.updateMany({
    where: {
      source: "SERPAPI",
      isActive: true,
      createdAt: { lt: cutoff },
    },
    data: { isActive: false },
  });

  console.log(`Deactivated ${result.count} opportunities`);
} finally {
  await prisma.$disconnect();
}