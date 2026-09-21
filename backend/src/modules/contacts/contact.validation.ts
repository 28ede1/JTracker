// ---------------------------------------------------------------------------
// Contact validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { ContactRelationship } from "../../../generated/prisma/enums.ts";

// The body of POST /contacts. Only firstName and relationship are required, and
// userId is missing on purpose: ownership comes from the verified token.
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

  lastContactedAt: z.coerce.date().optional(),
  nextFollowUpAt: z.coerce.date().optional(),
  companyId: z.uuid().optional()
});

// The query string of GET /contacts.
export const contactQueryRules = z.object({
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

  relationship: z.enum(ContactRelationship).optional(),
  companyId: z.guid().optional(),
});

// The id in GET /contacts/:id.
export const contactIdRules = z.guid();
