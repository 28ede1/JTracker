// ---------------------------------------------------------------------------
// Contact input validation
//
// The trust boundary for the contact module. Routes call these rule sets,
// services never do, so a service always receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

// Imported from the generated client so the schema stays the only place that
// decides which enum values are legal.
import { ContactRelationship } from "../../../generated/prisma/enums.ts";

// The body of POST /contacts. Only firstName and relationship are required,
// because a contact often starts as a name on a job posting and fills out over
// time as you actually meet the person.
//
// There is no userId field. Ownership comes from the verified token in the
// route, so accepting one here would let a client file a contact under somebody
// else.
export const newContactRules = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName:  z.string().trim().max(50).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().pipe(z.email()).optional(),
  phone: z.string().trim().min(1).max(200).optional(),

  // Checked as a real URL because it is rendered as a clickable link.
  linkedinUrl: z.string().trim().pipe(z.url()).optional(),
  relationship: z.enum(ContactRelationship),
  notes: z.string().trim().max(5000).optional(),

   // Turns "2026-03-01" into the Date that Prisma expects.
  lastContactedAt: z.coerce.date().optional(),
  nextFollowUpAt: z.coerce.date().optional(),
  companyId: z.uuid().optional()
});

// The query string of GET /contacts. Parameters arrive as text, so
// z.coerce turns "50" into 50 while parsing.
//
// The bounds close two holes. A page below 1 makes a negative skip that Prisma
// refuses, turning a bad URL into a 500. An unbounded limit lets one request
// pull the whole table.
export const contactQueryRules = z.object({
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

  relationship: z.enum(ContactRelationship).optional(),
  companyId: z.guid().optional(),
});

// The id in GET /contacts/:id. Postgres rejects a non-uuid string as a type
// error, so without this check a malformed id returns 500 instead of 400.
// z.guid() rather than z.uuid() because z.uuid() also enforces version bits and
// would reject valid ids from other systems.
export const contactIdRules = z.guid();
