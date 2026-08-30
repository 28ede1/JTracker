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
// 2b. An address that already has an account
//
// Supabase reports a duplicate in one of two ways depending on a project
// setting, so both are driven here with a fake client. That covers a setting
// this project is not currently using, without anything having to be changed in
// the dashboard to test it.
//
// The expected result is written once, above the tests, because the point is
// that both responses produce the *same* result. Repeating the literal in each
// test would let the two drift apart, and a form that says one thing when
// confirmation is on and another when it is off is a bug waiting to happen.
// ---------------------------------------------------------------------------

const ALREADY_REGISTERED = {
  ok: false,
  message: 'An account with this email already exists. Try logging in instead.',
  alreadyRegistered: true,
}

describe('signUpWithEmail, already registered', () => {
  // With email confirmation on, Supabase does not call this an error at all. It
  // returns a success carrying a placeholder user, and the empty identities
  // array is the only thing separating it from a real new account.
  it('reports a duplicate that arrives disguised as a success', async () => {
    const client = fakeClient({
      data: {
        user: { id: '00000000-0000-0000-0000-000000000000', identities: [] },
        session: null,
      },
      error: null,
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual(ALREADY_REGISTERED)
  })

  // With email confirmation off, the same situation arrives as an ordinary
  // error instead.
  it('reports a duplicate that arrives as an error', async () => {
    const client = fakeClient({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already registered' },
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    // Our wording, not Supabase's. "User already registered" describes a
    // database row; the message above tells the person what to do next.
    expect(result).toEqual(ALREADY_REGISTERED)
  })

  // The other half of the rule, and the more important half. An empty array
  // means taken, a populated one means genuinely new, and confusing the two
  // would refuse every real sign-up with "this email already exists".
  it('treats a populated identities array as a new account', async () => {
    const client = fakeClient({
      data: {
        user: { id: 'abc', identities: [{ id: 'identity-1', provider: 'email' }] },
        session: null,
      },
      error: null,
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({ ok: true, needsEmailConfirmation: true })
  })

  // identities is optional in Supabase's own types, so a response can arrive
  // without it. Missing is not the same as empty, and only empty means taken.
  // Without this test, a check written as !user.identities?.length would look
  // right and would quietly reject sign-ups whenever the field was absent.
  it('treats a missing identities array as a new account', async () => {
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

  // The flag belongs to this one case. Without this test, a change that set it
  // on every failure would still pass everything above, and a rate-limited
  // sign-up would start telling the user to go and log in instead.
  it('does not flag other failures as already registered', async () => {
    const client = fakeClient({
      data: { user: null, session: null },
      error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      client,
    )

    expect(result).toEqual({ ok: false, message: 'Email rate limit exceeded' })
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

  // Supabase itself does not say "that email is taken". It answers a duplicate
  // with an ordinary success carrying a placeholder user, so that nobody can
  // type addresses into the form to learn who has an account here. The service
  // reads the empty identities array in that response and turns it into the
  // failure asserted below, so this test is what proves the whole path works
  // against the real API and not just against a fake client.
  //
  // It is the test most likely to break for a reason that is not a bug in this
  // repository. The disguised response is a Supabase behaviour, so turning off
  // email confirmation, or a change on their side to how a duplicate is
  // reported, will surface here first.
  //
  // Costs no email and creates no account, because Supabase sends nothing when
  // the address is already confirmed. Unlike the test above, this one leaves
  // nothing behind to delete.
  it('reports that an address is already registered', async () => {
    const result = await signUpWithEmail({
      email: registeredEmail(),
      password: VALID_PASSWORD,
    })

    // The whole result, not just ok. The message is the sentence the user
    // actually reads, and alreadyRegistered is what a caller would key on to
    // offer a log-in link, so both are worth pinning rather than settling for
    // "something went wrong".
    expect(result).toEqual({
      ok: false,
      message: 'An account with this email already exists. Try logging in instead.',
      alreadyRegistered: true,
    })
  })

  // The same address with the wrong password has to give the same answer. Any
  // difference between the two would turn the form into a password oracle:
  // submit an address twice, once with a guess, and the responses would tell
  // you whether the guess was right.
  //
  // Also free. The address is confirmed, so no email is sent and no account is
  // created.
  it('answers a registered address the same way whatever the password', async () => {
    const result = await signUpWithEmail({
      email: registeredEmail(),
      password: 'Different0ne!',
    })

    expect(result).toEqual({
      ok: false,
      message: 'An account with this email already exists. Try logging in instead.',
      alreadyRegistered: true,
    })
  })

  // -------------------------------------------------------------------------
  // Signing up twice, before confirming
  //
  // The case a real user reaches by accident: they sign up, do not see the
  // email, and submit the form again a moment later.
  //
  // Supabase does not create a second account, and it does not report this as a
  // duplicate either. The account exists but is unconfirmed, so it reads the
  // second call as "send that confirmation email again", and resending is
  // capped at roughly one per minute per address. Two calls back to back land
  // inside that window, so the second one comes back as a rate limit failure.
  //
  // That is worth knowing rather than guessing, because it means an unconfirmed
  // duplicate and a confirmed one produce completely different messages, and
  // only one of them mentions an existing account.
  //
  // This is the most expensive test in the file: one real auth user and one
  // email. Delete the account afterwards with the others.
  // -------------------------------------------------------------------------
  it('rate limits a second sign-up made before the first is confirmed', async () => {
    // One address used twice, which is the whole point. Every other live test
    // builds a fresh one per call.
    const email = testEmail('unconfirmed-duplicate')

    const first = await signUpWithEmail({ email, password: VALID_PASSWORD })

    // Asserted rather than assumed. If the first call did not create the
    // account, the second would be an ordinary first sign-up and this test
    // would be measuring nothing.
    expect(first).toEqual({ ok: true, needsEmailConfirmation: true })

    const second = await signUpWithEmail({ email, password: VALID_PASSWORD })

    expect(second.ok).toBe(false)

    if (!second.ok) {
      // The wait is reported in whole seconds and differs from run to run, so
      // the number is matched as a pattern. Pinning the exact sentence would
      // pass once and fail every run after it.
      expect(second.message).toMatch(/only request this after \d+ seconds/i)

      // Not the duplicate message. An unconfirmed account is not reported as
      // already registered, and a caller that offered a "log in instead" link
      // here would be sending the user to an account they cannot log in to yet.
      expect(second).not.toHaveProperty('alreadyRegistered')
    }
  })
})
