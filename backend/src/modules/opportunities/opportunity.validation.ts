// ---------------------------------------------------------------------------
// Opportunity input validation
//
// The trust boundary for the opportunity module. Routes call these rule sets,
// services never do, so a service always receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

// Imported from the generated client so the schema stays the only place that
// decides which enum values are legal.
import { OpportunityType, WorkMode } from "../../../generated/prisma/enums.ts";

// The body of POST /opportunities. Only type, title and sourceUrl are required,
// because most sources supply those three and little else.
export const newOpportunityRules = z.object({
  type: z.enum(OpportunityType),
  title: z.string().trim().min(1).max(200),

  // Checked as a real URL because it is rendered as a clickable link.
  sourceUrl: z.url().max(2000),

  description: z.string().max(20000).optional(),
  location: z.string().trim().max(200).optional(),
  workMode: z.enum(WorkMode).optional(),

  // Turns "2026-03-01" into the Date that Prisma expects.
  postedAt: z.coerce.date().optional(),
  deadlineAt: z.coerce.date().optional(),

  companyId: z.guid().optional(),

  // Type-specific fields, such as a hackathon's team size. Only the shape and
  // the size are checked, so one client cannot write megabytes per row. Per-type
  // rules come once those fields are decided.
  details: z
    .record(z.string(), z.json())
    .refine((value) => JSON.stringify(value).length <= 4000, {
      message: "details is too large",
    })
    .optional(),
});

// The query string of GET /opportunities. Parameters arrive as text, so
// z.coerce turns "50" into 50 while parsing.
//
// The bounds close two holes. A page below 1 makes a negative skip that Prisma
// refuses, turning a bad URL into a 500. An unbounded limit lets one request
// pull the whole table.
export const opportunityQueryRules = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),

  // Trimmed and capped so a huge string never reaches a LIKE query. An empty
  // ?q= means the search box was cleared, so it becomes undefined and drops the
  // filter instead of failing.
  q: z
    .string()
    .trim()
    .max(100)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),

  type: z.enum(OpportunityType).optional(),
  workMode: z.enum(WorkMode).optional(),
  companyId: z.guid().optional(),
  location: z.string().trim().max(200).optional(),

  // z.coerce.boolean() would read "false" as true, since any non-empty string
  // is truthy. Mapping the two literal strings by hand avoids that. Closed
  // postings are hidden by default, so isActive=false is how you ask for them.
  isActive: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

// The id in GET /opportunities/:id. Postgres rejects a non-uuid string as a type
// error, so without this check a malformed id returns 500 instead of 400.
// z.guid() rather than z.uuid() because z.uuid() also enforces version bits and
// would reject valid ids from other systems.
export const opportunityIdRules = z.guid();
