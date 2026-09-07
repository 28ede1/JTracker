// ---------------------------------------------------------------------------
// Fit Analysis input validation
//
// The trust boundary for the Fit Analyses module. Routes call these rule sets,
// services never do, so a service always receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

// the rest of the fields will be updated by the AI call directly, 
// using prisma operations
export const newFitAnalysisRules = z.object({
    resumeId: z.guid(),
    opportunityId: z.guid(),
})

// The query string of GET /fit-analyses. 
export const fitAnalysisQueryRules = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})

// The id in GET and DELETE /fit-analyses/:id. 
export const fitAnalysisIdRules = z.guid();