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
