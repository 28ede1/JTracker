// ---------------------------------------------------------------------------
// Sign-up form
//
// Collects an email and password, hands them to the sign-up service, and
// renders whichever answer comes back. It knows nothing about how signing up
// works, which is what lets the service be tested on its own.
//
// "await" pauses this function until Supabase responds. While waiting, the rest
// of the application can continue operating.
//
// During sign-up, Supabase:
//
// 1. receives the email and password over HTTPS
// 2. checks whether the credentials are acceptable
// 3. checks whether an Auth account already exists
// 4. securely hashes the password
// 5. creates a user in Supabase Auth, for example { id, email, ... }
// 6. sends a confirmation email if email confirmation is enabled
// 7. returns either successful data or an error
// 8. may return a session, depending on the email-confirmation settings
//
// If email confirmation is required, signUp usually returns a user but no
// active session. The user must complete the confirmation flow.
//
// Supabase Auth owns the user's identity and credentials. JTracker, through
// Prisma, owns application information such as username, applications,
// resumes, contacts, and alerts.
//
// Sessions and access tokens
//
// A session represents an ongoing authenticated login. Conceptually it
// contains:
//
// - user information
// - an access token
// - a refresh token
// - expiration information
//
// The access token is a short-lived JWT containing claims about the
// authenticated identity, including:
//
// - sub: the Supabase user's unique ID
// - email: the user's email
// - role: normally "authenticated"
// - exp: when the access token expires
//
// The frontend sends the access token to protected Express endpoints. Express
// verifies the token before trusting its claims.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import type { SubmitEvent } from 'react'

import { signUpWithEmail } from './signup.service'

function SignUpFormTesting() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // The form does not know how signing up works. It collects what was typed,
  // hands it over, and renders whichever answer comes back.
  //
  // Validation lives inside the service, so a weak password is caught here
  // without a network round trip, and the same rules still apply if sign-up is
  // ever triggered from somewhere other than this form.
  async function handleSignUp(email: string, password: string) {
    const result = await signUpWithEmail({ email, password })

    if (!result.ok) {
      setErrorMessage(result.message)
      setSuccessMessage('')
      return
    }

    // Two shapes of success. No session means the account exists but is
    // unconfirmed, which is the case that sends the user to their inbox.
    setSuccessMessage(
      result.needsEmailConfirmation
        ? 'Check your email to confirm your account.'
        : 'Your account is ready.',
    )
    setErrorMessage('')
  }

  // -------------------------------------------------------------------------
  // Submit handler
  //
  // This exists only to translate a browser event into a sign-up attempt.
  // handleSignUp stays free of DOM details, so it can be triggered from
  // anywhere, and this wrapper holds the one thing that is form specific.
  //
  // preventDefault cancels the browser's built-in submit behaviour, which is to
  // reload the page and put every field in the URL. Without it the typed
  // password would land in the address bar, browser history, and server logs.
  // -------------------------------------------------------------------------
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    await handleSignUp(email, password)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {/*
        type="submit" is what lets the browser fire onSubmit, both on click and
        when Enter is pressed inside a field.
      */}
      <button type="submit">Sign up</button>

      {errorMessage ? <p>{errorMessage}</p> : <p>{successMessage}</p>}
    </form>
  )
}

export default SignUpFormTesting
