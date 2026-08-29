// ---------------------------------------------------------------------------
// Log-in service
//
// similar structure as Sign Up service, see signup.service.ts
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'
import {logInRules} from './login.validation'

export type LogInResult =
  | { ok: true }
  | { ok: false; message: string; needsEmailConfirmation?: true }

export async function logInWithEmail(
input: unknown,
client: SupabaseClient = supabase,
): Promise<LogInResult> {
const parsed = logInRules.safeParse(input)

if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message }
}

const { data, error } = await client.auth.signInWithPassword(parsed.data)

if (error?.code === 'email_not_confirmed') {
    return {
      ok: false,
      message: 'Please confirm your email before logging in.',
      needsEmailConfirmation: true,
    }
  }

if (error) {
    return {
        ok: false,
        message: error.message,
    }
}

return { ok: true }
}