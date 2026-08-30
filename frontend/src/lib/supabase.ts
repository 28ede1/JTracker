// ---------------------------------------------------------------------------
// Supabase client
//
// A client is an object that lets the frontend communicate with Supabase.
//
// createClient needs a project URL to tell the client which Supabase project to
// send requests to, and a publishable key to identify the project and allow the
// frontend to use its public services.
//
// supabase.auth.signUp(...)
// supabase.auth.signInWithPassword(...)
// supabase.auth.signOut()
//
// The client also stores and manages the user's authentication session in the
// browser. We create it once here and import the same client throughout the app
// instead of creating a separate Supabase connection in every component.
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Fail at startup with a clear message, rather than on the first login attempt
// with a confusing network error.
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill in the values.',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
