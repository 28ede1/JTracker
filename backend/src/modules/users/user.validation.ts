// ---------------------------------------------------------------------------
// User validation
//
// Validates client input, and defines the object shape of what a new row should
// look like. Normalizes input and rejects anything incorrectly formatted.
// Routes call these.
//
// strict() rather than the plain object rule the other modules use, so a body
// carrying an id is refused outright instead of silently stripped.
// ---------------------------------------------------------------------------

import { z } from 'zod';

// Defined once, so the availability check accepts exactly the names create and
// update accept.
export const usernameRules = z.string().trim().min(1).max(50)

export const newUserRules = z
  .object({
    username: usernameRules,
  })
  .strict()

export const updateUserRules = z
  .object({
    username: usernameRules,
  })
  .strict()

// The query string of GET /users/availability.
export const usernameQueryRules = z.object({
  username: usernameRules,
})