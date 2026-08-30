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
import { checkUsernameAvailability } from './username.service'

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
  | { ok: false; message: string; alreadyRegistered?: true, usernameTaken?: true }

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

  // Injected for the same reason as client: these tests must be able to run
  // with no backend listening on port 3000.
  checkUsername: typeof checkUsernameAvailability = checkUsernameAvailability,
): Promise<SignUpResult> {
  const parsed = signUpRules.safeParse(input)

  if (!parsed.success) {
    // Only the first problem is reported. Listing every broken rule at once
    // tends to overwhelm rather than help.
    return { ok: false, message: parsed.error.issues[0].message }
  }

  // -------------------------------------------------------------------------
  // The username, asked about before the account is created
  //
  // The order is the important part. Supabase Auth owns the account and
  // JTracker's database owns the username, and this code cannot delete an auth
  // account it just created: deleting one needs the secret key, which the
  // browser deliberately never holds. Creating the account first and only then
  // discovering the username was taken would strand a real person, signed up
  // but with no profile and unable to retry with the same email.
  //
  // Asking first is not a guarantee. Two people can pass this check seconds
  // apart and both go on to claim the same name. The @unique constraint on
  // User.username in the database is what actually decides, and the request
  // that creates the user row is where a genuine clash gets reported. This
  // check exists to give a fast, clear message in the ordinary case, not to be
  // the rule.
  // -------------------------------------------------------------------------
  const availability = await checkUsername(parsed.data.username)

  if (availability.status === 'taken') {
    return {
      ok: false,
      message: 'That username is already taken. Try another one.',
      usernameTaken: true,
    }
  }

  // The third case earns its keep here. Carrying on would create an account
  // against a name nobody confirmed was free, so an unreachable backend stops
  // sign-up rather than half finishing it.
  if (availability.status === 'unknown') {
    return { ok: false, message: availability.message }
  }

  const { email, password, username } = parsed.data

  // -------------------------------------------------------------------------
  // Why the username rides along in options.data
  //
  // Email confirmation is on, so this call creates the account and returns no
  // session. No session means no access token, and POST /users sits behind
  // requireAuth, so the profile row cannot be created here. The username has to
  // survive the gap between signing up and confirming.
  //
  // options.data is that carrier. Supabase stores it on the auth user as
  // user_metadata and hands it back with the session on first log-in, which is
  // the moment the profile row can finally be created.
  //
  // Two things it is not. It is not storage: JTracker's User table stays the
  // owner of the username. And it is not trusted, because a signed-in user can
  // rewrite their own metadata with auth.updateUser. The backend re-validates
  // it and the @unique constraint decides, exactly as it would for any other
  // value typed by a stranger.
  //
  // The fields are passed explicitly rather than handing over the whole parsed
  // object, so the shape sent to Supabase is visible in one glance.
  // -------------------------------------------------------------------------
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })

  // -------------------------------------------------------------------------
  // An address that already has an account
  //
  // Supabase reports this in one of two ways, depending on a project setting,
  // so both are handled here and turned into a single result the form can
  // render without caring which one arrived.
  //
  // 1. With email confirmation on, it does not report it at all. It returns an
  //    ordinary success carrying a placeholder user whose identities array is
  //    empty. That empty array is the only signal.
  // 2. With email confirmation off, it returns a real error, coded
  //    user_already_exists.
  //
  // Worth being clear about the trade: Supabase hides case 1 so that nobody can
  // type addresses into this form to learn who has an account here. Reporting
  // it gives that up in exchange for telling a real user why their sign-up did
  // not work.
  // -------------------------------------------------------------------------
  if (error?.code === 'user_already_exists' || data.user?.identities?.length === 0) {
    return {
      ok: false,
      message: 'An account with this email already exists. Try logging in instead.',
      alreadyRegistered: true,
    }
  }

  if (error) {
    return { ok: false, message: error.message }
  }

  // With email confirmation enabled, Supabase creates the user but returns no
  // session. That absence is how the caller knows to say "check your email"
  // rather than treating the user as signed in.
  return { ok: true, needsEmailConfirmation: data.session === null }
}
