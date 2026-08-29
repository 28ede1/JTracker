import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'

import { supabase } from '../../lib/supabase'
import { logInWithEmail } from './login.service'

// ---------------------------------------------------------------------------
// Log-in service tests
//
// Same three groups as signup.service.test.ts, in order of how much they depend
// on the outside world:
//
// 1. tests that bad input is rejected before it hits Supabase
// 2. the injected client, which proves the seam that makes 1 and 3 separable
// 3. real Supabase Auth, which logs in with an actual account
//
// Group 3 is cheaper than its sign-up counterpart. Logging in creates no auth
// user and sends no email, so nothing has to be deleted from the dashboard
// afterwards. What it does need is the opposite: an account that already
// exists, is confirmed, and whose password this file can be told.
// ---------------------------------------------------------------------------

const TEST_PREFIX = 'jtracker-test'

// The same inbox the sign-up tests use, read from .env.local so it never
// reaches git or the browser bundle.
const TEST_EMAIL: string = import.meta.env.SIGNUP_TEST_EMAIL ?? ''

// The password of that confirmed account. It lives in .env.local rather than in
// this file because, unlike VALID_PASSWORD below, it is a working credential:
// pasted here it would be a real log-in for anyone reading the repository.
const TEST_PASSWORD: string = import.meta.env.LOGIN_TEST_PASSWORD ?? ''

// The stable address from signup.service.test.ts, rebuilt with the same rule so
// both files point at one account. It is the account you created by hand and
// confirmed for the sign-up suite, which is exactly what a log-in test needs:
// a fresh timestamped address would have nothing to log in to.
function registeredEmail() {
  const [name, domain] = TEST_EMAIL.split('@')

  return `${name}+${TEST_PREFIX}-registered@${domain}`
}

// Well-formed but never sent anywhere. The offline tests stop at validation or
// at a stand-in client, so any valid-looking address works.
const OFFLINE_EMAIL = 'student@example.com'

// Satisfies every rule in login.validation.ts, so a failure in these tests is
// never about password strength. It is not anyone's real password.
const VALID_PASSWORD = 'Passw0rd!'

// ---------------------------------------------------------------------------
// 1. Input the service refuses on its own
// ---------------------------------------------------------------------------

// These pass a client that throws if it is ever touched. That turns "no request
// was sent" from something assumed into something the test actually proves.
//
// It matters more here than on sign-up. Every request that leaves the browser
// counts against Supabase's log-in rate limit, so a malformed attempt that
// still reaches the network spends part of the budget a real user needs.
const forbiddenClient = {
  auth: {
    signInWithPassword: () => {
      throw new Error(
        'signInWithPassword was called for input that should have been rejected',
      )
    },
  },
} as unknown as SupabaseClient

describe('logInWithEmail, invalid input', () => {
  it('rejects a bad email without calling Supabase', async () => {
    const result = await logInWithEmail(
      { email: 'not-an-email', password: VALID_PASSWORD },
      forbiddenClient,
    )

    expect(result).toEqual({ ok: false, message: 'Enter a valid email address' })
  })

  it('rejects a weak password without calling Supabase', async () => {
    const result = await logInWithEmail(
      { email: OFFLINE_EMAIL, password: 'short' },
      forbiddenClient,
    )

    expect(result).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters',
    })
  })

  it('rejects a password missing a special character', async () => {
    const result = await logInWithEmail(
      { email: OFFLINE_EMAIL, password: 'Passw0rdd' },
      forbiddenClient,
    )

    expect(result).toEqual({
      ok: false,
      message: 'Password must contain a special character',
    })
  })

  // The service takes unknown, so it has to survive input that is not even an
  // object rather than trusting its caller to have checked first.
  it('rejects input that is not an object', async () => {
    const result = await logInWithEmail('nonsense', forbiddenClient)

    expect(result.ok).toBe(false)
  })

  it('rejects an empty object', async () => {
    const result = await logInWithEmail({}, forbiddenClient)

    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. The injected client
//
// These use a stand-in client to drive branches that are awkward or expensive
// to trigger against the real service. The unconfirmed-email branch is the
// clearest example: reaching it for real means signing up a brand new account
// and leaving it unconfirmed, which spends an email from the free tier's small
// hourly allowance and leaves a user to delete by hand. A fake client reaches
// the same branch for nothing.
// ---------------------------------------------------------------------------

// Builds a client that always answers the same way, so a test can state the
// exact response it wants to exercise.
//
// data is always present, even on the error responses, because that is what
// Supabase really returns: an error comes back alongside { user: null,
// session: null }, not instead of it.
function fakeClient(response: { data: unknown; error: unknown }) {
  return {
    auth: { signInWithPassword: async () => response },
  } as unknown as SupabaseClient
}

describe('logInWithEmail, injected client', () => {
  it('passes the validated values through to Supabase', async () => {
    // Records what the client was handed, to confirm the service forwards the
    // cleaned values rather than the raw ones.
    let received: unknown

    const recordingClient = {
      auth: {
        signInWithPassword: async (credentials: unknown) => {
          received = credentials
          return {
            data: { user: { id: 'abc' }, session: { access_token: 'token' } },
            error: null,
          }
        },
      },
    } as unknown as SupabaseClient

    await logInWithEmail(
      { email: '  Student@Example.com  ', password: VALID_PASSWORD, phone: '+15550000000' },
      recordingClient,
    )

    // Whitespace is gone and the undeclared phone field never made it out of
    // the service. That second half is the reason this test exists: Supabase
    // reads a phone credential as a different way of naming the account, so a
    // stray field reaching it could change who is being logged in.
    expect(received).toEqual({
      email: 'Student@Example.com',
      password: VALID_PASSWORD,
    })
  })

  it('reports a Supabase error as a failed result', async () => {
    // Pretending Supabase rejected the credentials. This is the message a real
    // wrong password produces, and it is deliberately vague about which half
    // was wrong.
    const client = fakeClient({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    const result = await logInWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({ ok: false, message: 'Invalid login credentials' })
  })

  // An unconfirmed account is a failure with a specific cure, so the service
  // rewrites Supabase's wording and tags the result. The tag is what lets a
  // caller offer a "resend confirmation" button later without this file being
  // reopened, which is the Open-Closed principle in practice.
  it('recognises an unconfirmed email and flags it', async () => {
    const client = fakeClient({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    })

    const result = await logInWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({
      ok: false,
      message: 'Please confirm your email before logging in.',
      needsEmailConfirmation: true,
    })
  })

  // The flag belongs to that one error code and nothing else. Without this
  // test, a change that set it on every failure would still pass the test
  // above, and every wrong password would start telling users to check an
  // inbox that has nothing in it.
  it('does not flag confirmation for other errors', async () => {
    const client = fakeClient({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    const result = await logInWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).not.toHaveProperty('needsEmailConfirmation')
  })

  it('reports a successful log-in', async () => {
    const client = fakeClient({
      data: {
        user: { id: 'abc' },
        session: { access_token: 'token', refresh_token: 'refresh' },
      },
      error: null,
    })

    const result = await logInWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    // toEqual on the whole object, not just result.ok, is the point of this
    // test. It pins that the tokens stay inside the Supabase client and never
    // ride out in the result, where a component could put them into rendered
    // text or a log line.
    expect(result).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// 3. Real Supabase Auth
//
// Logs in for real, against the confirmed account the sign-up suite already
// asks you to create by hand.
//
// skipIf reports these as skipped instead of failing when either variable is
// unset. A test that cannot run should say so plainly. Failing instead would
// train you to ignore a red suite, which is how a real failure gets missed.
// ---------------------------------------------------------------------------

describe.skipIf(!TEST_EMAIL || !TEST_PASSWORD)('logInWithEmail, real Supabase Auth', () => {
  // A successful log-in leaves a live session inside the shared client, and
  // that client outlives the test. Signing out afterwards keeps one test from
  // handing its authenticated state to whatever runs next, which is the kind of
  // hidden dependency that makes a suite pass in one order and fail in another.
  afterAll(async () => {
    await supabase.auth.signOut()
  })

  it('logs in with correct credentials', async () => {
    const result = await logInWithEmail({
      email: registeredEmail(),
      password: TEST_PASSWORD,
    })

    expect(result).toEqual({ ok: true })
  })

  // Supabase answers a wrong password and an address with no account in exactly
  // the same words, because a different answer would let anyone type addresses
  // at the log-in form to learn who has an account here. The two assertions
  // below pin that sameness, so a future change that starts distinguishing them
  // fails loudly rather than quietly leaking the list of users.
  it('refuses a wrong password without saying the account exists', async () => {
    const result = await logInWithEmail({
      email: registeredEmail(),
      password: 'Wr0ngPassword!',
    })

    expect(result).toEqual({ ok: false, message: 'Invalid login credentials' })
  })

  it('gives an unknown address the same answer as a wrong password', async () => {
    const [name, domain] = TEST_EMAIL.split('@')

    const result = await logInWithEmail({
      email: `${name}+${TEST_PREFIX}-no-such-account@${domain}`,
      password: VALID_PASSWORD,
    })

    expect(result).toEqual({ ok: false, message: 'Invalid login credentials' })
  })
})
