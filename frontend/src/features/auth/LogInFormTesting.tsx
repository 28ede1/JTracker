// ---------------------------------------------------------------------------
// Log-in form
//
// Same structure as SignUpFormTesting.tsx. See that file for the split between
// the submit handler and the attempt itself, what preventDefault is for, and
// what a session and an access token are.
//
// During log-in, Supabase:
//
// 1. receives the email and password
// 2. finds the existing Auth account
// 3. verifies the supplied password against the stored password hash
// 4. creates a session
// 5. returns an access token and refresh token
//
// The Supabase client stores and manages the browser's session. It can
// automatically refresh an expiring access token.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import type { SubmitEvent } from 'react'

import { logInWithEmail } from './login.service'

function LogInFormTesting() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Only one shape of success here, unlike sign-up. A log-in either produces a
  // session or fails, so there is no second message to choose between.
  async function handleLogIn(email: string, password: string) {
    const result = await logInWithEmail({ email, password })

    if (!result.ok) {
      setErrorMessage(result.message)
      setSuccessMessage('')
      return
    }

    setSuccessMessage('Successfully logged in.')
    setErrorMessage('')
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    await handleLogIn(email, password)
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

      <button type="submit">Log in</button>

      {errorMessage ? <p>{errorMessage}</p> : <p>{successMessage}</p>}
    </form>
  )
}

export default LogInFormTesting
