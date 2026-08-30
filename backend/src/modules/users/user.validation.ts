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

// ---------------------------------------------------------------------------
// What a username is
//
// Defined once and reused by every rule set below. The availability check has
// to accept exactly the names that create and update accept, otherwise the
// sign-up form would call a name free and then fail on submit. Sharing the rule
// makes that impossible rather than merely unlikely.
// ---------------------------------------------------------------------------

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

// The query string of GET /users/availability. Parameters arrive as text and a
// missing ?username= arrives as undefined, so both are refused here rather than
// reaching the database as an empty search.
export const usernameQueryRules = z.object({
  username: usernameRules,
})