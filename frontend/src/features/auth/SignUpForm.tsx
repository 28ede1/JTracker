import { useState } from 'react'

import { signUpWithEmail } from './signup.service'


function SignUpForm () {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')


    // "await" pauses this function until Supabase responds.
    // While waiting, the rest of the application can continue operating.
    //
    // During sign-up, Supabase:
    //
    // 1. receives the email and password over HTTPS
    // 2. checks whether the credentials are acceptable
    // 3. checks whether an Auth account already exists
    // 4. securely hashes the password
    // 5. creates a user in Supabase Auth
    //    Example: { id, email, email_confirmed_at, ... }
    //
    // Supabase Auth owns the user's identity and credentials.
    // JTracker/Prisma owns application information such as username,
    // applications, resumes, contacts, and alerts.
    //
    // 6. sends a confirmation email if email confirmation is enabled
    // 7. returns either successful data or an error
    // 8. may return a session, depending on the email-confirmation settings
    //
    // If email confirmation is required, signUp usually returns a user but
    // no active session. The user must complete the confirmation flow.
    //
    // A session represents an ongoing authenticated login.
    //
    // Conceptually, a session contains:
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
    // The frontend sends the access token to protected Express endpoints.
    // Express verifies the token before trusting its claims.
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
    //
    // During sign-out:
    //
    // 1. Supabase revokes the relevant refresh token/session
    // 2. the Supabase client removes its locally stored session
    // 3. the frontend treats the user as logged out
    // 4. protected Express requests should no longer have a valid token
    //
    // In general:
    //
    // Usable frontend session = the browser treats the user as logged in.
    //
    // Verified access token = Express can trust which user sent a request.

    // Authorization Middleware
    // 1) authentication middleware identifies the user from the access token (gets user UI)
    // 2) endpoint checks access (userId retrieved equals userId that a row belongs to)
    async function handleSignUp(
        email: string,
        password: string,
      ) {
        // The form no longer knows how signing up works. It collects what was
        // typed, hands it over, and renders whichever answer comes back.
        //
        // Validation lives inside the service, so a weak password is caught
        // here without a network round trip, and the same rules still apply if
        // sign-up is ever triggered from somewhere other than this form.
        const result = await signUpWithEmail({ email, password });

        if (!result.ok) {
            setErrorMessage(result.message);
            setSuccessMessage("");
            return;
        }

        // Two shapes of success. No session means the account exists but is
        // unconfirmed, which is the case that sends the user to their inbox.
        setSuccessMessage(
            result.needsEmailConfirmation
                ? "Check your email to confirm your account."
                : "Your account is ready.",
        );
        setErrorMessage("");
      }
    return (
        <form>
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

            <button
                type="button"
                onClick={() => handleSignUp(email, password)}
            >
                Sign up 
            </button>

            {errorMessage ? (
            <p>{errorMessage}</p>
            ) : (
            <p>{successMessage}</p>
            )}

        </form>
    );
}

export default SignUpForm
