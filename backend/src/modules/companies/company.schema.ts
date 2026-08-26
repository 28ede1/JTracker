// ---------------------------------------------------------------------------
// Company schema
//
// Describes what a valid request body looks like. Data from a client is never
// trusted, so it gets checked before it reaches the service. Extra fields that
// are not described here get stripped away.
// ---------------------------------------------------------------------------

import { z } from "zod";

export const newCompanyRules = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
});
