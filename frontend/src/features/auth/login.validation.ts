// ---------------------------------------------------------------------------
// Login-in input validation
// 
// similar structure as Sign-up input validation, see signup.validation.ts
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

export type LogInRules = z.infer<typeof logInRules>