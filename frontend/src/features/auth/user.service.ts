// ---------------------------------------------------------------------------
// User profile service
//
// Owns one job: make sure the signed-in person has a row in JTracker's own User
// table.
//
// Two systems hold two halves of a person. Supabase Auth owns the identity, the
// email and the password. JTracker's database owns everything the product is
// actually about: the username, applications, contacts, resumes. Signing up
// fills in the first half. This fills in the second.
//
// The work itself happens on the server, in user.service.ts, where Prisma has a
// database connection. This file is the browser's half of that conversation: it
// builds the request, attaches the token, and turns the reply into something a
// component can render. Same relationship as checkUsernameAvailability in
// username.service.ts and isUsernameTaken on the backend.
//
// It sits beside username.service.ts rather than inside signup.service.ts
// because it is not part of signing up. The row can be missing for reasons that
// have nothing to do with a form: the account was confirmed by clicking a link
// in an email days later, the backend was down on the first attempt, or the
// account predates the User table. Anything that produces a session should be
// able to call this, so it belongs on its own.
// ---------------------------------------------------------------------------

import type { Session } from '@supabase/supabase-js'
import { z } from 'zod'

import { API_URL } from '../../lib/api'

// The same result shape as every other service in this folder. See
// signup.service.ts for why a returned value beats a thrown error.
export type EnsureUserProfileResult =
  | { ok: true }
  | { ok: false; message: string }

// ---------------------------------------------------------------------------
// Why the username is checked before it is sent
//
// user_metadata is a free-form bag that the Supabase client types as any, and
// its contents were last written by a browser. Reading .username straight off it
// would hand undefined to JSON.stringify and produce a 400 from the backend that
// says nothing useful. Checking here turns a missing name into a sentence a
// person can act on.
// ---------------------------------------------------------------------------
const metadataRules = z.object({ username: z.string().trim().min(1) })

export async function ensureUserProfile(
  session: Session,

  // A parameter with a default, the same pattern as the Supabase client in
  // signup.service.ts and fetch in username.service.ts. The app passes nothing
  // and gets the browser's fetch; a test passes a stand-in and never touches the
  // network. Dependency Inversion: this file depends on the shape of fetch, not
  // on the real one.
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<EnsureUserProfileResult> {
  const metadata = metadataRules.safeParse(session.user.user_metadata)

  // No username to claim, so there is nothing to create. An account made before
  // the username field existed lands here, and so would one whose metadata was
  // rewritten. The honest answer is to say so rather than send an empty name.
  if (!metadata.success) {
    return {
      ok: false,
      message: 'Your account needs a username before you can continue.',
    }
  }

  let response: Response

  // fetch only rejects when the request never completed: the server is down, the
  // connection dropped, the browser blocked it. A 409 or a 500 is a completed
  // request and does not land here. Both are handled, just separately, exactly
  // as in username.service.ts.
  try {
    response = await fetcher(`${API_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',

        // How the backend learns who this is. requireAuth reads this header,
        // asks Supabase to verify the token, and only then trusts the id inside
        // it. The id is never put in the body: a body is typed by the client and
        // a signed token is not, so sending one would let anybody claim to be
        // anybody.
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ username: metadata.data.username }),
    })
  } catch {
    return {
      ok: false,
      message: 'Could not reach JTracker. Check your connection and try again.',
    }
  }

  // The row exists, either because this request created it or because it was
  // already there. Both are success, which is the whole point of an endpoint
  // that is safe to call again.
  if (response.ok) {
    return { ok: true }
  }

  // The unique constraint on username refused. Someone else claimed the name
  // between the availability check at sign-up and this moment, which is exactly
  // the race that check was never able to close.
  if (response.status === 409) {
    return {
      ok: false,
      message: 'That username was taken by someone else. Please pick another one.',
    }
  }

  // The token was rejected. An expired session is the ordinary cause, and the
  // fix is a fresh log-in rather than a retry.
  if (response.status === 401) {
    return { ok: false, message: 'Your session has expired. Please log in again.' }
  }

  return {
    ok: false,
    message: 'Could not finish setting up your account. Please try again.',
  }
}
