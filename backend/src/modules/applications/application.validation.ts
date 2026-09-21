// ---------------------------------------------------------------------------
// Application validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { ApplicationStatus } from "../../../generated/prisma/enums.ts"; 

// The body of POST /applications. userId and statusChangedAt are missing on
// purpose: the server owns both.
export const newApplicationRules = z.object({
    status: z.enum(ApplicationStatus).optional(),
    appliedAt: z.coerce.date().optional(),
    notes: z.string().trim().max(5000).optional(),

    // Required, because an application is always made to a specific posting.
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

// The body of PATCH /applications/:id. .partial() makes every field optional,
// so a client can send only what it is changing. Sending null clears appliedAt
// or notes, while leaving a field out keeps its current value.
export const updateApplicationRules = z
  .object({
    status: z.enum(ApplicationStatus),
    appliedAt: z.coerce.date().nullable(),
    notes: z.string().trim().max(5000).nullable(),
  })
  .partial();
  
// The id in GET, PATCH and DELETE /applications/:id. 
export const applicationIdRules = z.guid();

