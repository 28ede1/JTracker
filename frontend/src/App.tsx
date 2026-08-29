import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignUpFormTesting from './features/auth/SignUpFormTesting';
import LogInFormTesting from './features/auth/LogInFormTesting';
import SignOutButtonTesting from './features/auth/SignOutButtonTesting';

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [showSignUp, setShowSignUp] = useState(true)
  

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
