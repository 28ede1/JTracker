import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { signUpWithEmail } from './signup.service'
import type { UsernameAvailability } from './username.service'

// ---------------------------------------------------------------------------
// Sign-up service tests
//
// Four groups, in order of how much they depend on the outside world:
//
// 1. tests that bad input is rejected before it hits supabase
// 2. the injected client, which proves the seam that makes 1 and 3 separable
// 3. the injected username check, the same idea applied to our own backend
// 4. real Supabase Auth, which creates an actual account
//
// Group 4 costs something every run. Supabase creates a real auth user, and an
// auth user cannot be deleted with the publishable key, only with the secret
// key that this app deliberately never holds. Those accounts are removed by
// hand from the dashboard, under Authentication > Users. Every address below
// starts with TEST_PREFIX so they are easy to find and delete together.
//
// Supabase also rate limits sign-up emails, and the built-in SMTP allowance on
// the free tier is only a handful per hour. That is why group 4 makes as few
// live calls as it can rather than one per behaviour.
//
// Nothing in this file reaches the Express backend. signUpWithEmail takes the
// availability check as a parameter, so every test hands it a stand-in and no
// test needs a server running on port 3000. username.service.test.ts is where
// the real check is tested, against a fake fetch.
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

// Same idea for the username. Every test that is not about the username uses
// this one, so a failure can only mean the thing the test was actually varying.
const VALID_USERNAME = 'bob2'

// ---------------------------------------------------------------------------
// Stand-ins for the availability check
//
// The real one is an HTTP request to our Express API. Passing a fake in its
// place is the whole reason signUpWithEmail takes it as a parameter: these
// tests describe what sign-up does with each answer, and none of them should
// depend on a server being up, or on which usernames happen to be in the
// database today.
//
// Mirrors fakeClient below. Same pattern, different collaborator.
// ---------------------------------------------------------------------------
function fakeUsernameCheck(result: UsernameAvailability) {
  return async () => result
}

const usernameIsFree = fakeUsernameCheck({ status: 'available' })

// Throws if it is ever reached, the username equivalent of forbiddenClient. It
// turns "the availability request was never sent" from something assumed into
// something the test proves.
const forbiddenUsernameCheck = async (): Promise<UsernameAvailability> => {
  throw new Error('the username was checked for input that should have been rejected')
}

// ---------------------------------------------------------------------------
// 1. Input the service refuses on its own
//
// These pass a client that throws if it is ever touched, and an availability
// check that does the same. Between them, "no request was sent anywhere" is
// proved rather than assumed.
//
// Every case below supplies a valid username, so the one broken field is the
// one the test is named after. Leaving it out would break two rules at once and
// the test would still pass, for the wrong reason.
// ---------------------------------------------------------------------------

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
      { email: 'not-an-email', password: VALID_PASSWORD, username: VALID_USERNAME },
      forbiddenClient,
      forbiddenUsernameCheck,
    )

    expect(result).toEqual({ ok: false, message: 'Enter a valid email address' })
  })

  it('rejects a weak password without calling Supabase', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: 'short', username: VALID_USERNAME },
      forbiddenClient,
      forbiddenUsernameCheck,
    )

    expect(result).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters',
    })
  })

  it('rejects a password missing a special character', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: 'Passw0rdd', username: VALID_USERNAME },
      forbiddenClient,
      forbiddenUsernameCheck,
    )

    expect(result).toEqual({
      ok: false,
      message: 'Password must contain a special character',
    })
  })

  // A missing username is refused by the same rules as a missing password, and
  // refused *before* the availability request goes out. Asking the backend
  // whether an empty name is free would be a wasted round trip for a question
  // with an obvious answer.
  it('rejects a missing username without asking the backend', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD },
      forbiddenClient,
      forbiddenUsernameCheck,
    )

    expect(result.ok).toBe(false)
  })

  it('rejects an empty username without asking the backend', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: '   ' },
      forbiddenClient,
      forbiddenUsernameCheck,
    )

    expect(result.ok).toBe(false)
  })

  // The service takes unknown, so it has to survive input that is not even an
  // object rather than trusting its caller to have checked first.
  it('rejects input that is not an object', async () => {
    const result = await signUpWithEmail('nonsense', forbiddenClient, forbiddenUsernameCheck)

    expect(result.ok).toBe(false)
  })

  it('rejects an empty object', async () => {
    const result = await signUpWithEmail({}, forbiddenClient, forbiddenUsernameCheck)

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
      {
        email: '  Student@Example.com  ',
        password: VALID_PASSWORD,
        username: '  bob2  ',
        role: 'admin',
      },
      recordingClient,
      usernameIsFree,
    )

    // Three things at once, and all three are worth pinning.
    //
    // Whitespace is gone from both the email and the username, and the
    // undeclared role field never made it out of the service, which is the
    // point of validating before the call.
    //
    // And the username is nested under options.data rather than sitting
    // alongside the password. That is not decoration: options.data is what
    // Supabase stores as user_metadata, and a username written at the top level
    // instead would be silently dropped. Silently is the problem, so the shape
    // gets asserted here rather than trusted.
    expect(received).toEqual({
      email: 'Student@Example.com',
      password: VALID_PASSWORD,
      options: { data: { username: 'bob2' } },
    })
  })

  it('reports a Supabase error as a failed result', async () => {
    // Pretends Supabase responded with a rate-limit error.
    const client = fakeClient({
      data: { user: null, session: null },
      error: { message: 'Email rate limit exceeded' },
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
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
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
    )

    expect(result).toEqual({ ok: true, needsEmailConfirmation: true })
  })

  it('does not flag confirmation when a session comes back', async () => {
    const client = fakeClient({
      data: { user: { id: 'abc' }, session: { access_token: 'token' } },
      error: null,
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
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
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
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
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
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
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
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
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
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
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
    )

    expect(result).toEqual({ ok: false, message: 'Email rate limit exceeded' })
  })
})

// ---------------------------------------------------------------------------
// 3. The injected username check
//
// Three answers come back from the availability check and sign-up has to do
// something different with each. These drive all three without a backend.
//
// What these do *not* test is whether the check itself reads a 500 correctly or
// survives a broken JSON body. That belongs to username.service.ts and is
// tested in its own file. The split is deliberate: this file is about what
// sign-up decides, that one is about how the request is read.
// ---------------------------------------------------------------------------

describe('signUpWithEmail, username availability', () => {
  it('refuses a taken username', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      // Throws if signUp is reached. The account must never be created for a
      // name that is already spoken for.
      forbiddenClient,
      fakeUsernameCheck({ status: 'taken' }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'That username is already taken. Try another one.',
      usernameTaken: true,
    })
  })

  // -------------------------------------------------------------------------
  // The ordering guard
  //
  // This is the test that would have caught the original bug, where the check
  // ran after signUp instead of before it. The browser cannot delete an auth
  // account it created, so a taken username discovered too late leaves a real
  // person signed up with no profile and unable to retry with the same email.
  //
  // forbiddenClient above already proves it, but only as a side effect of the
  // message assertion. Stating it as its own test means a future rearrangement
  // fails with "signUp was called", which names the actual mistake, instead of
  // failing somewhere confusing.
  // -------------------------------------------------------------------------
  it('does not create an account when the username is taken', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      forbiddenClient,
      fakeUsernameCheck({ status: 'taken' }),
    )

    // If signUp had been reached, forbiddenClient would have thrown and this
    // line would never run.
    expect(result.ok).toBe(false)
  })

  // -------------------------------------------------------------------------
  // The case worth being fussy about
  //
  // "Could not ask" is not "available". Treating a failed request as a free
  // name would create an account against a username nobody confirmed was free,
  // and the clash would only surface later, when the profile row is written and
  // the unique constraint refuses it. By then the auth account exists and
  // cannot be undone from the browser.
  //
  // So an unreachable backend stops sign-up, and it stops it before Supabase is
  // touched. forbiddenClient is what proves the second half.
  // -------------------------------------------------------------------------
  it('stops sign-up when the username could not be checked', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      forbiddenClient,
      fakeUsernameCheck({
        status: 'unknown',
        message: 'Could not reach JTracker. Check your connection and try again.',
      }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'Could not reach JTracker. Check your connection and try again.',
    })
  })

  // The unknown case must not borrow the taken flag. A caller keying on
  // usernameTaken would otherwise highlight the username field and tell the
  // user to pick another name, when the real problem was the network and the
  // name they chose was probably fine.
  it('does not flag an unchecked username as taken', async () => {
    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      forbiddenClient,
      fakeUsernameCheck({ status: 'unknown', message: 'Could not check that username.' }),
    )

    expect(result).not.toHaveProperty('usernameTaken')
  })

  // The other half of the rule. Available has to actually let sign-up through,
  // otherwise a service that refused every name would pass all three tests
  // above and nobody could ever register.
  it('carries on to Supabase when the username is free', async () => {
    const client = fakeClient({
      data: { user: { id: 'abc' }, session: null },
      error: null,
    })

    const result = await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: VALID_USERNAME },
      client,
      usernameIsFree,
    )

    expect(result).toEqual({ ok: true, needsEmailConfirmation: true })
  })

  // The name reaching the check is the cleaned one, not the raw one. Without
  // this, " bob2 " would be asked about with its spaces intact, come back free
  // because no such name exists, and then be stored trimmed as "bob2" against
  // an account that already holds it.
  it('checks the trimmed username, not the raw one', async () => {
    let asked: string | undefined

    const recordingCheck = async (username: string): Promise<UsernameAvailability> => {
      asked = username
      return { status: 'available' }
    }

    await signUpWithEmail(
      { email: OFFLINE_EMAIL, password: VALID_PASSWORD, username: '  bob2  ' },
      fakeClient({ data: { user: { id: 'abc' }, session: null }, error: null }),
      recordingCheck,
    )

    expect(asked).toBe('bob2')
  })
})

// ---------------------------------------------------------------------------
// 4. Real Supabase Auth
//
// Creates an account for real. Delete these from the dashboard afterwards.
//
// skipIf reports these as skipped instead of failing when SIGNUP_TEST_EMAIL is
// unset. A test that cannot run should say so plainly. Failing instead would
// train you to ignore a red suite, which is how a real failure gets missed.
//
// These still pass usernameIsFree rather than the real check. What is being
// tested here is Supabase, and requiring the Express server to be running as
// well would mean these fail for a reason that has nothing to do with what they
// assert. One live dependency per test is enough.
// ---------------------------------------------------------------------------

// Unique per run, for the same reason the addresses are. These names travel to
// Supabase as user_metadata on a real account, so reusing one would leave every
// test account claiming the same name.
function testUsername(label: string) {
  return `jtracker-${label}-${Date.now()}`
}

describe.skipIf(!TEST_EMAIL)('signUpWithEmail, real Supabase Auth', () => {
  it('creates an account and reports that confirmation is needed', async () => {
    const result = await signUpWithEmail(
      {
        email: testEmail('new'),
        password: VALID_PASSWORD,
        username: testUsername('new'),
      },
      undefined,
      usernameIsFree,
    )

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
    const result = await signUpWithEmail(
      {
        email: registeredEmail(),
        password: VALID_PASSWORD,
        username: testUsername('registered'),
      },
      undefined,
      usernameIsFree,
    )

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
    const result = await signUpWithEmail(
      {
        email: registeredEmail(),
        password: 'Different0ne!',
        username: testUsername('registered'),
      },
      undefined,
      usernameIsFree,
    )

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
    const username = testUsername('unconfirmed-duplicate')

    const first = await signUpWithEmail(
      { email, password: VALID_PASSWORD, username },
      undefined,
      usernameIsFree,
    )

    // Asserted rather than assumed. If the first call did not create the
    // account, the second would be an ordinary first sign-up and this test
    // would be measuring nothing.
    expect(first).toEqual({ ok: true, needsEmailConfirmation: true })

    const second = await signUpWithEmail(
      { email, password: VALID_PASSWORD, username },
      undefined,
      usernameIsFree,
    )

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
