import { useState } from 'react'

import { signOut } from './signout.service'

function SignOutButtonTesting () {
    const [successMessage, setSuccessMessage] = useState("")
    const [errorMessage, setErrorMessage] = useState("")

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

    async function handleSignOut() {
        const result = await signOut();

        if (!result.ok) {
            setErrorMessage(result.message)
            setSuccessMessage("");
            return;
        }

        setSuccessMessage("You have signed out successfully.")
        setErrorMessage("")
    }

    return (
        <>
            <button type="button" onClick={handleSignOut}>
                Sign Out
            </button>

            {successMessage && <p>{successMessage}</p>}
            {errorMessage && <p>{errorMessage}</p>}
        </>
    )

}

export default SignOutButtonTesting