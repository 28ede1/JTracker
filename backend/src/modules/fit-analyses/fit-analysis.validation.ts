// ---------------------------------------------------------------------------
// Fit Analysis validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

// The body of POST /fit-analyses. The client only names what to compare: score,
// summary, strengths, gaps and model are written later by the AI call.
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