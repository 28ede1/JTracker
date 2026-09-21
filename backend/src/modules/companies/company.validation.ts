// ---------------------------------------------------------------------------
// Company validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

// The body of POST /companies. Only name is required, because a company often
// arrives from a job posting that names the employer and nothing else.
export const newCompanyRules = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  websiteUrl: z.string().optional(),
  logoUrl: z.string().optional(),
});

// The query string of GET /companies.
export const companyQueryRules = z.object({
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
});
