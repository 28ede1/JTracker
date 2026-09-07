// ---------------------------------------------------------------------------
// Resume input validation
//
// The trust boundary for the resume module. Routes call these rule sets,
// services never do, so a service always receives values that are already valid.
//
// Only what the client types is checked here. The file's own facts, meaning its
// format, its size, and where it ends up stored, are measured from the upload
// itself rather than read from the request, so none of them appear below.
// ---------------------------------------------------------------------------

import { z } from "zod";

// The text fields sent alongside the file in POST /resumes.
//
// label is the name the user gives this version, such as "Backend SWE v3", and
// it is the only thing on the entire request that they actually type. Everything
// else the Resume row needs is derived from the file or from the verified token.
export const newResumeRules = z.object({
  label: z.string().trim().min(1).max(100),
});

// The id in DELETE /resumes/:id.
//
// A value out of the URL is client input like any other, and checking its shape
// here means the service is never handed something that cannot be an id. It
// also saves a database round trip for junk like /resumes/hello.
export const resumeIdRules = z.guid();

// Query string of GET /resumes
export const resumeQueryRules = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  label: z.string().trim().max(100).optional()
});
