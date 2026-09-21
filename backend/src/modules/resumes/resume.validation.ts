// ---------------------------------------------------------------------------
// Resume validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these. Only what the client types is checked here: the file's own
// format and size are measured by the upload middleware.
// ---------------------------------------------------------------------------

import { z } from "zod";

// The text fields sent alongside the file in POST /resumes. label is the name
// the user gives this version, such as "Backend SWE v3".
export const newResumeRules = z.object({
  label: z.string().trim().min(1).max(100),
});

// The id in DELETE /resumes/:id.
export const resumeIdRules = z.guid();

// Query string of GET /resumes
export const resumeQueryRules = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  label: z.string().trim().max(100).optional()
});
