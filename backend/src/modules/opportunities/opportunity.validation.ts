// ---------------------------------------------------------------------------
// Opportunity validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

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
  postedAt: z.coerce.date().optional(),
  deadlineAt: z.coerce.date().optional(),
  companyId: z.guid().optional(),

  // Type-specific fields, such as a hackathon's team size. Capped so one client
  // cannot write megabytes per row.
  details: z
    .record(z.string(), z.json())
    .refine((value) => JSON.stringify(value).length <= 4000, {
      message: "details is too large",
    })
    .optional(),
});

// The query string of GET /opportunities.
export const opportunityQueryRules = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),

  // An empty ?q= means the search box was cleared, so it turns into undefined
  // and drops the filter rather than searching for the empty string.
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

  // z.coerce.boolean() would read "false" as true, since any non-empty string is
  // truthy, so the two literal strings are mapped by hand. Closed postings stay
  // hidden unless isActive=false is asked for.
  isActive: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

// The id in GET /opportunities/:id. z.guid() rather than z.uuid(), which also
// enforces version bits and would turn away valid ids from another system.
export const opportunityIdRules = z.guid();
