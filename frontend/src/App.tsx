// ---------------------------------------------------------------------------
// App
//
// Decides which auth screen to show. A live session means the user is signed
// in, so the sign-out button is rendered. Otherwise the sign-up or log-in form
// is shown, whichever the toggle is currently pointing at.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from './lib/supabase'
import SignUpFormTesting from './features/auth/SignUpFormTesting'
import LogInFormTesting from './features/auth/LogInFormTesting'
import SignOutButtonTesting from './features/auth/SignOutButtonTesting'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [showSignUp, setShowSignUp] = useState(true)

  // Asks the Supabase client for the session it already holds in the browser,
  // so a returning user is not shown a form they do not need. The empty
  // dependency array runs this once, after the first render.
  useEffect(() => {
    async function getSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      console.log(session)
      setSession(session)
    }

    getSession()
  }, [])

  return (
    <>
      <h1>Placeholder</h1>

      {session ? (
        <SignOutButtonTesting />
      ) : showSignUp ? (
        <>
          <SignUpFormTesting />

          <button type="button" onClick={() => setShowSignUp(false)}>
            Already have an account? Log in
          </button>
        </>
      ) : (
        <>
          <LogInFormTesting />

          <button type="button" onClick={() => setShowSignUp(true)}>
            Don&apos;t have an account? Sign up
          </button>
        </>
      )}
    </>
  )
}

export default App
