// ---------------------------------------------------------------------------
// Sign-out service
//
// Same structure as signup.service.ts. See that file for why the result is a
// returned value instead of a thrown error, and why the client is a parameter
// with a default.
//
// There is nothing for the user to type, so this is the one service with no
// input and no validation step.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'

export type SignOutResult =
  | { ok: true }
  | { ok: false; message: string }

export async function signOut(
  client: SupabaseClient = supabase,
): Promise<SignOutResult> {
  const { error } = await client.auth.signOut()

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true }
}
