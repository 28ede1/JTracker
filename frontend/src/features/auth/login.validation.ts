// ---------------------------------------------------------------------------
// Log-in input validation
//
// Same structure as signup.validation.ts. See that file for why the rules live
// in their own module, and why they are a convenience rather than a security
// boundary.
//
// The rules are written out again here instead of being shared, on purpose.
// Log-in and sign-up are free to drift apart, so a change to one must not
// silently change the other.
// ---------------------------------------------------------------------------

import { z } from 'zod'

export const logInRules = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address')),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
})

export type LogInInput = z.infer<typeof logInRules>
