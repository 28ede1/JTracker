// ---------------------------------------------------------------------------
// User input validation
//
// The trust boundary for the user module. Routes call these rule sets,
// services never do, so a service always receives values that are already valid.

// The client should never be able to provide an ID to change the stored user ID.
// For security purposes, strict() is used to reject any input containing an ID,
// rather than silently removing it.
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const newUserRules = z
  .object({
    username: z.string().trim().min(1).max(50),
  })
  .strict()

export const updateUserRules = z
  .object({
    username: z.string().trim().min(1).max(50),
  })
  .strict()