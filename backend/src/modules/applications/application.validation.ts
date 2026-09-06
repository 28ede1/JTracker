// ---------------------------------------------------------------------------
// Application input validation
//
// The trust boundary for the application module. Routes call these rule sets,
// services never do, so a service always receives values that are already valid.
// ---------------------------------------------------------------------------

import { z } from "zod";

// Imported from the generated client so the schema stays the only place that
// decides which enum values are legal.
import { ApplicationStatus } from "../../../generated/prisma/enums.ts"; 

// The body of POST /applications. 

export const newApplicationRules = z.object({
    status: z.enum(ApplicationStatus).optional(),
    appliedAt: z.coerce.date().optional(),
    notes: z.string().trim().max(5000).optional(),

    // Required because applications are made to a specific opportunity
    opportunityId: z.guid(),

    resumeId: z.guid().optional(),
    referralContactId: z.guid().optional()
})

// The query string of GET /applications. 
export const applicationQueryRules = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),

  status: z.enum(ApplicationStatus).optional(),
  opportunityId: z.guid().optional(),
});

// Validates the body of PATCH /applications/:id.
//
// .partial() makes every field optional, allowing the client to update only
// the fields it sends. Sending null clears appliedAt or notes, while leaving
// a field out keeps its current value unchanged.
export const updateApplicationRules = z
  .object({
    status: z.enum(ApplicationStatus),
    appliedAt: z.coerce.date().nullable(),
    notes: z.string().trim().max(5000).nullable(),
  })
  .partial();
  
// The id in GET, PATCH and DELETE /applications/:id. 
export const applicationIdRules = z.guid();

