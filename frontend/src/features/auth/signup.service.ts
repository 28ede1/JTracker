// ---------------------------------------------------------------------------
// Sign-up service
//
// Owns the conversation with Supabase Auth. The form owns rendering, this owns
// what signing up actually means.
//
// That split is the Single Responsibility principle in practice: rewording a
// button cannot break sign-up, and changing sign-up cannot break the layout.
// It is also what makes sign-up testable at all, because a plain function can
// be called from a test while a button inside a component cannot.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'
import { signUpRules } from './signup.validation'

// A result value instead of a thrown error. The caller has to check ok before
// TypeScript will let it reach either branch, which makes it impossible to
// render a success message for a failed sign-up.
//
// An already-registered address is a failure carrying a message, the same as
// any other, so the form's existing error branch handles it without being
// touched. alreadyRegistered rides along for callers that want to do something
// extra, such as offering a link to sign in. That is the Open-Closed principle
// paying off: a new case was added without reopening the code that renders it.
export type SignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; message: string; alreadyRegistered?: true }

// input is unknown rather than SignUpInput on purpose. The whole job of this
// function starts with distrusting what it was given, so it should not claim
// the shape is already correct.
//
// client is a parameter with a default rather than a hard-coded import. The app
// passes nothing and gets the shared client; a test can pass its own. This is
// the Dependency Inversion principle: the file depends on the SupabaseClient
// shape, not on one specific instance of it.
export async function signUpWithEmail(
  input: unknown,
  client: SupabaseClient = supabase,
): Promise<SignUpResult> {
  const parsed = signUpRules.safeParse(input)

  if (!parsed.success) {
    // Only the first problem is reported. Listing every broken rule at once
    // tends to overwhelm rather than help.
    return { ok: false, message: parsed.error.issues[0].message }
  }

  const { data, error } = await client.auth.signUp(parsed.data)

  if (error) {
    return { ok: false, message: error.message }
  }

  // With email confirmation enabled, Supabase creates the user but returns no
  // session. That absence is how the caller knows to say "check your email"
  // rather than treating the user as signed in.
  return { ok: true, needsEmailConfirmation: data.session === null }
}
