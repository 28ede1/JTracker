import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignUpFormTesting from './features/auth/SignUpFormTesting';
import LogInFormTesting from './features/auth/LogInFormTesting';

function App() {const [session, setSession] = useState<Session | null>(null)
  

  useEffect(() => {
    async function getSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSession(session)
    }

    getSession()
  }, [])
  return (
    <>
      <h1>Placeholder</h1>
      {/* <SignUpFormTesting/> */}
      {session ? "You Signed In" : <LogInFormTesting />}

      
    </>
  )
}

export default App
