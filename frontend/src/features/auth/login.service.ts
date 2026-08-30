// ---------------------------------------------------------------------------
// Log-in service
//
// Same structure as signup.service.ts. See that file for why the result is a
// returned value instead of a thrown error, why input is typed as unknown, and
// why the client is a parameter with a default.
//
// The unconfirmed-email branch below is the one piece of logic that is new
// here.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'
import { logInRules } from './login.validation'

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

  const { error } = await client.auth.signInWithPassword(parsed.data)

  // An unconfirmed account is a failure with a specific cure, so it gets its
  // own wording and a flag. The flag is what lets a caller add a "resend
  // confirmation" button later without this file being reopened.
  if (error?.code === 'email_not_confirmed') {
    return {
      ok: false,
      message: 'Please confirm your email before logging in.',
      needsEmailConfirmation: true,
    }
  }

  if (error) {
    return { ok: false, message: error.message }
  }

  // Nothing from the response is returned. The session and its tokens stay
  // inside the Supabase client, where a component cannot put them into rendered
  // text or a log line.
  return { ok: true }
}
