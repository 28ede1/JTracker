// ---------------------------------------------------------------------------
// Company input validation
//
// The trust boundary for the company module. Every export here is one rule set
// for one shape of untrusted input: newCompanyRules for the POST body,
// companyQueryRules for the GET query string.
//
// Each rule set rejects bad input, converts text into real types, and strips
// undeclared fields. Routes call them, services never do, so a service always
// receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

// The body of POST /companies. Only name is required, because a company often
// arrives from a job posting that names the employer and nothing else. 
// (note that z.object strips the extra/unrecognized fields from the parsed result)
export const newCompanyRules = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
});

// The query string of GET /companies. Parameters arrive as text, so z.coerce
// turns "50" into 50 while parsing.
//
// The bounds close two holes. A page below 1 makes a negative skip that Prisma
// refuses, turning a bad URL into a 500. An unbounded limit lets one request
// pull the whole table.
export const companyQueryRules = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),

  // Trimmed and capped so a huge string never reaches a LIKE query. An empty
  // ?q= means the search box was cleared, so it becomes undefined and drops the
  // filter instead of failing. optional() sits last so a missing q is allowed.
  q: z
    .string()
    .trim()
    .max(100)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});
