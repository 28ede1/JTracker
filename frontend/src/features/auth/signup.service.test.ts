import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { signUpWithEmail } from './signup.service'

// ---------------------------------------------------------------------------
// Sign-up service tests
//
// Three groups, in order of how much they depend on the outside world:
//
// 1. tests that bad input is rejected before it hits supabase
// 2. the injected client, which proves the seam that makes 1 and 3 separable
// 3. real Supabase Auth, which creates an actual account
//
// Group 3 costs something every run. Supabase creates a real auth user, and an
// auth user cannot be deleted with the publishable key, only with the secret
// key that this app deliberately never holds. Those accounts are removed by
// hand from the dashboard, under Authentication > Users. Every address below
// starts with TEST_PREFIX so they are easy to find and delete together.
//
// Supabase also rate limits sign-up emails, and the built-in SMTP allowance on
// the free tier is only a handful per hour. That is why group 3 makes as few
// live calls as it can rather than one per behaviour.
// ---------------------------------------------------------------------------

const TEST_PREFIX = 'jtracker-test'

// A real inbox you control, read from .env.local so it never reaches git or the
// browser bundle. Supabase checks the address before sending anything and
// refuses placeholder domains such as example.com, so a live sign-up needs a
// genuine one.
//
// When it is unset the live group is skipped rather than failed, so the suite
// still passes on a machine that has not been set up for live tests.
const TEST_EMAIL: string = import.meta.env.SIGNUP_TEST_EMAIL ?? ''

// A fresh address per run, using the plus trick: most providers ignore anything
// between the + and the @ when delivering, so every address built here lands in
// the same inbox while Supabase sees a brand new account each time.
//
// Reusing one fixed address would mean the first run creates an account and
// every run after it takes the already-registered path instead, so the test
// would quietly stop testing what it claims to test.
function testEmail(label: string) {
  const [name, domain] = TEST_EMAIL.split('@')

  return `${name}+${TEST_PREFIX}-${label}-${Date.now()}@${domain}`
}

// The opposite: one stable address, no timestamp, so it stays registered from
// one run to the next. The already-registered test needs an account that
// already exists, which is the one thing a fresh address can never be.
//
// This needs setting up once, by hand. Sign up with the address it prints,
// open the inbox, and click the confirmation link.
//
// Confirmed is the important word there. Signing up again against an account
// that exists but is *unconfirmed* is read by Supabase as "resend my
// confirmation email", which is capped at about one per minute, so the call
// comes back as a rate-limit error rather than the duplicate response. Only a
// confirmed account produces the behaviour this test is about.
function registeredEmail() {
  const [name, domain] = TEST_EMAIL.split('@')

  return `${name}+${TEST_PREFIX}-registered@${domain}`
}

// Well-formed but never sent anywhere. The offline tests stop at validation, so
// any valid-looking address works and they stay independent of the variable
// above.
const OFFLINE_EMAIL = 'student@example.com'

// Satisfies every rule in signup.validation.ts, so a failure in these tests is
// never about password strength.
const VALID_PASSWORD = 'Passw0rd!'

// ---------------------------------------------------------------------------
// 1. Input the service refuses on its own
// ---------------------------------------------------------------------------

// These pass a client that throws if it is ever touched. That turns "no request
// was sent" from something assumed into something the test actually proves.
const forbiddenClient = {
  auth: {
    signUp: () => {
      throw new Error('signUp was called for input that should have been rejected')
    },
  },
} as unknown as SupabaseClient

describe('signUpWithEmail, invalid input', () => {
  it('rejects a bad email without calling Supabase', async () => {
    const result = await signUpWithEmail(
      { email: 'not-an-email', password: VALID_PASSWORD },
      forbiddenClient,
    )

    expect(result).toEqual({ ok: false, message: 'Enter a valid email address' })
  })

  it('rejects a weak password without calling Supabase', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: 'short' },
      forbiddenClient,
    )

    expect(result).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters',
    })
  })

  it('rejects a password missing a special character', async () => {
    const result = await signUpWithEmail(
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
    const result = await signUpWithEmail('nonsense', forbiddenClient)

    expect(result.ok).toBe(false)
  })

  it('rejects an empty object', async () => {
    const result = await signUpWithEmail({}, forbiddenClient)

    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. The injected client
//
// These use a stand-in client to drive branches that are awkward to trigger
// against the real service. Making the client a parameter is what buys this:
// an error path can be tested without having to make Supabase actually fail.
// ---------------------------------------------------------------------------

// Builds a client that always answers the same way, so a test can state the
// exact response it wants to exercise.
function fakeClient(response: { data: unknown; error: unknown }) {
  return {
    auth: { signUp: async () => response },
  } as unknown as SupabaseClient
}

describe('signUpWithEmail, injected client', () => {
  it('passes the validated values through to Supabase', async () => {
    // Records what the client was handed, to confirm the service forwards the
    // cleaned values rather than the raw ones.
    let received: unknown

    // Proves signUp runs after validation, without a real call creating an
    // auth record on Supabase.
    const recordingClient = {
      auth: {
        signUp: async (credentials: unknown) => {
          received = credentials
          return { data: { user: {}, session: null }, error: null }
        },
      },
    } as unknown as SupabaseClient

    await signUpWithEmail(
      { email: '  Student@Example.com  ', password: VALID_PASSWORD, role: 'admin' },
      recordingClient,
    )

    // Whitespace is gone and the undeclared role field never made it out of the
    // service, which is the point of validating before the call.
    expect(received).toEqual({
      email: 'Student@Example.com',
      password: VALID_PASSWORD,
    })
  })

  it('reports a Supabase error as a failed result', async () => {
    // Pretends Supabase responded with a rate-limit error.
    const client = fakeClient({
      data: { user: null, session: null },
      error: { message: 'Email rate limit exceeded' },
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({ ok: false, message: 'Email rate limit exceeded' })
  })

  // The two shapes of success. A missing session means the account exists but
  // is unconfirmed, which is the whole reason the form says "check your email"
  // instead of treating the user as signed in.
  it('flags that confirmation is needed when no session comes back', async () => {
    const client = fakeClient({
      data: { user: { id: 'abc' }, session: null },
      error: null,
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({ ok: true, needsEmailConfirmation: true })
  })

  it('does not flag confirmation when a session comes back', async () => {
    const client = fakeClient({
      data: { user: { id: 'abc' }, session: { access_token: 'token' } },
      error: null,
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({ ok: true, needsEmailConfirmation: false })
  })
})

// ---------------------------------------------------------------------------
// 3. Real Supabase Auth
//
// Creates an account for real. Delete these from the dashboard afterwards.
//
// skipIf reports these as skipped instead of failing when SIGNUP_TEST_EMAIL is
// unset. A test that cannot run should say so plainly. Failing instead would
// train you to ignore a red suite, which is how a real failure gets missed.
// ---------------------------------------------------------------------------

describe.skipIf(!TEST_EMAIL)('signUpWithEmail, real Supabase Auth', () => {
  it('creates an account and reports that confirmation is needed', async () => {
    const result = await signUpWithEmail({
      email: testEmail('new'),
      password: VALID_PASSWORD,
    })

    // needsEmailConfirmation being true encodes a dashboard setting: email
    // confirmation is enabled for this project. If it is ever turned off,
    // Supabase returns a session immediately and this flips to false.
    expect(result).toEqual({ ok: true, needsEmailConfirmation: true })
  })

  // Supabase does not say "that email is taken", because doing so would let
  // anyone test addresses against the project to learn who has an account. It
  // returns an ordinary success instead. The privacy behaviour is the thing
  // being pinned here, so a future change that starts leaking it fails loudly.
  //
  // Costs no email and creates no account, because Supabase sends nothing when
  // the address is already confirmed. Unlike the test above, this one leaves
  // nothing behind to delete.
  it('does not reveal that an address is already registered', async () => {
    const result = await signUpWithEmail({
      email: registeredEmail(),
      password: VALID_PASSWORD,
    })

    // The whole result, not just ok. Checking ok alone would also accept
    // { ok: true, needsEmailConfirmation: false }, which would mean Supabase
    // handed back a live session for an existing account. That is a serious
    // bug, and the looser assertion would have waved it straight through.
    expect(result).toEqual({ ok: true, needsEmailConfirmation: true })
  })
})
