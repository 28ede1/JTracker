import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Supabase client
//
// One shared client for the whole app. Components import this instead of
// calling createClient themselves, which keeps the configuration in a single
// place and means there is only ever one auth session held in memory.
// ---------------------------------------------------------------------------

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
