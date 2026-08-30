// ---------------------------------------------------------------------------
// Sign-up input validation tests
//
// These run with no browser, no network and no Supabase project, because the
// rules are just a function over a plain object. That is the payoff for putting
// them in their own file instead of inline in the component.
//
// The vitest API used throughout:
//
// - describe groups related tests
// - it defines an individual test
// - expect checks that the result is what you expect
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import { signUpRules } from './signup.validation'

// A password that satisfies every rule. Tests that are about the email use it
// so that a failure can only mean the email rule broke, and the password tests
// vary one thing away from it so a failure can only mean that one thing.
const VALID_PASSWORD = 'Passw0rd!'

describe('signUpRules, email', () => {
  it('accepts a valid email and password', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: VALID_PASSWORD,
    })

    expect(result.success).toBe(true)
  })

  it('trims surrounding whitespace from the email', () => {
    const result = signUpRules.safeParse({
      email: '  student@example.com  ',
      password: VALID_PASSWORD,
    })

    expect(result.success).toBe(true)

    // The check sits inside this branch because result.data only exists when
    // success is true. TypeScript enforces that.
    if (result.success) {
      expect(result.data.email).toBe('student@example.com')
    }
  })

  it('rejects an email with no @ sign', () => {
    const result = signUpRules.safeParse({
      email: 'not-an-email',
      password: VALID_PASSWORD,
    })

    expect(result.success).toBe(false)
  })

  it('rejects an empty email', () => {
    const result = signUpRules.safeParse({
      email: '',
      password: VALID_PASSWORD,
    })

    expect(result.success).toBe(false)
  })

  it('rejects a body with no email', () => {
    const result = signUpRules.safeParse({ password: VALID_PASSWORD })

    expect(result.success).toBe(false)
  })

  // The message is what the user actually reads, so it is worth pinning rather
  // than only checking that validation failed.
  it('explains what is wrong with a bad email', () => {
    const result = signUpRules.safeParse({
      email: 'nope',
      password: VALID_PASSWORD,
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Enter a valid email address')
    }
  })
})

// ---------------------------------------------------------------------------
// Password rules
//
// One test per rule, each breaking exactly one requirement while keeping the
// other three satisfied. Written this way, a failing test names the broken rule
// on its own, without anyone having to read the password to work out which
// requirement it was meant to violate.
// ---------------------------------------------------------------------------

describe('signUpRules, password', () => {
  it('accepts a password meeting every requirement', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: VALID_PASSWORD,
    })

    expect(result.success).toBe(true)
  })

  it('accepts a password of exactly 8 characters', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: 'Abcdef1!',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: 'Ab1!efg',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a password with no uppercase letter', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: 'passw0rd!',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a password with no lowercase letter', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: 'PASSW0RD!',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a password with no number', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: 'Password!',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a password with no special character', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: 'Passw0rdd',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a body with no password', () => {
    const result = signUpRules.safeParse({ email: 'student@example.com' })

    expect(result.success).toBe(false)
  })

  it('rejects values that are not strings', () => {
    const result = signUpRules.safeParse({ email: 12345, password: 12345678 })

    expect(result.success).toBe(false)
  })

  // Pins the wording of each requirement, since these are the strings the user
  // reads when a sign-up is refused.
  it('explains which password requirement was missed', () => {
    const cases = [
      { password: 'Ab1!efg', message: 'Password must be at least 8 characters' },
      { password: 'passw0rd!', message: 'Password must contain an uppercase letter' },
      { password: 'PASSW0RD!', message: 'Password must contain a lowercase letter' },
      { password: 'Password!', message: 'Password must contain a number' },
      { password: 'Passw0rdd', message: 'Password must contain a special character' },
    ]

    for (const { password, message } of cases) {
      const result = signUpRules.safeParse({
        email: 'student@example.com',
        password,
      })

      expect(result.success).toBe(false)

      if (!result.success) {
        // Finds the password issue rather than assuming it is first, so this
        // test does not break if an email rule is added later.
        const passwordIssue = result.error.issues.find(
          (issue) => issue.path[0] === 'password',
        )

        expect(passwordIssue?.message).toBe(message)
      }
    }
  })
})

// A field that is not declared in the schema must never be forwarded to
// Supabase. Without this, a stray property on the form state could be passed
// straight through to the auth API, which is why it gets its own test.
describe('signUpRules, unknown fields', () => {
  it('strips fields that are not in the schema', () => {
    const result = signUpRules.safeParse({
      email: 'student@example.com',
      password: VALID_PASSWORD,
      role: 'admin',
    })

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data).toEqual({
        email: 'student@example.com',
        password: VALID_PASSWORD,
      })
    }
  })
})
