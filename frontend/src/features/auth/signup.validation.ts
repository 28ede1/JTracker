// ---------------------------------------------------------------------------
// Sign-up input validation
//
// The one place that decides what counts as an acceptable email password and user.
// The form calls it before touching the network, so a typo is reported
// instantly instead of after a round trip.
//
// This is a convenience check, not a security boundary. Anyone can call the
// Supabase API without going through this form, so Supabase enforces its own
// rules on the server regardless. Treat this as a faster error message, never
// as protection.
// ---------------------------------------------------------------------------

import { z } from 'zod'

export const signUpRules = z.object({
  // trim runs before the format check, so an address pasted with a trailing
  // space gets cleaned up rather than rejected. pipe is what orders the two
  // steps: clean the text first, then judge the result.
  email: z.string().trim().pipe(z.email('Enter a valid email address')),

  // Supabase's own minimum is 6 characters and nothing else. Everything below
  // is stricter than that floor by choice.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),

  username: z.string().trim().min(1).max(50),
})

// Infers the type from the schema instead of declaring it separately, so the
// type can never drift out of sync with the rules above.
export type SignUpInput = z.infer<typeof signUpRules>
