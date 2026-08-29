// ---------------------------------------------------------------------------
// Log-in form
//
// similar structure as log in form , see LogInForm
// ---------------------------------------------------------------------------

import { useState } from 'react'
import type { SubmitEvent } from 'react'

import { logInWithEmail } from './login.service'


function LogInFormTesting () {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')


    // "await" pauses this function until Supabase responds.
    // While waiting, the rest of the application can continue operating.
    //
    // During sign-in, Supabase:
    //
    // 1. receives the email and password
    // 2. finds the existing Auth account
    // 3. verifies the supplied password against the stored password hash
    // 4. creates a session
    // 5. returns an access token and refresh token
    //
    // The Supabase client stores and manages the browser's session.
    // It can automatically refresh an expiring access token.
    async function handleLogIn(
        email: string,
        password: string,
      ) {
        const result = await logInWithEmail({ email, password });

        if (!result.ok) {
            setErrorMessage(result.message);
            setSuccessMessage("");
            return;
        }

        setSuccessMessage("Successfully logged in.");
        setErrorMessage("");
      }

    // -----------------------------------------------------------------------
    // Submit handler
    //
    // Same split as SignUpForm. This wrapper owns the browser event,
    // handleLogIn owns the log-in attempt itself.
    //
    // preventDefault cancels the browser's built-in submit behaviour, which
    // is to reload the page and put every field in the URL. Without it the
    // typed password would land in the address bar, browser history, and
    // server logs.
    // -----------------------------------------------------------------------
    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        await handleLogIn(email, password);
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
                type="submit" is what lets the browser fire onSubmit, both on
                click and when Enter is pressed inside a field.
            */}
            <button type="submit">
                LogIn
            </button>

            {errorMessage ? (
            <p>{errorMessage}</p>
            ) : (
            <p>{successMessage}</p>
            )}

        </form>
    );
}

export default LogInFormTesting
