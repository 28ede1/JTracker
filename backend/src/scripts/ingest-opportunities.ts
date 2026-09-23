// ---------------------------------------------------------------------------
// Opportunity ingestion script
//
// The entry point for the scheduled import. "npm run ingest" runs this file,
// because package.json points its ingest script at it.
//
// ---------------------------------------------------------------------------

import "dotenv/config";

import { prisma } from "../lib/prisma.ts";
import { ingestSerpApiOpportunities } from "../modules/opportunities/opportunity.ingest.ts";

try {
  const summary = await ingestSerpApiOpportunities();
  console.log("Ingestion finished:", summary);
} catch (error) {
  console.error("Ingestion failed:", error);

  // A non-zero exit code is how a scheduler is told the run did not work, so
  // that a failure shows up as a failure rather than a silent success.
  process.exitCode = 1;
} finally {
  // A server keeps running and holds its connections open, but a script ends.
  // Without this the process stays alive waiting on an idle connection.
  await prisma.$disconnect();
}
