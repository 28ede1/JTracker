// ---------------------------------------------------------------------------
// Supabase client (server side)
//
// One shared client for the whole app, for the same reason as lib/prisma.ts.
//
// The only job it has here is turning an access token into a user id. That
// needs no special privilege, so this holds the publishable key rather than the
// secret one. Keeping the least powerful key that still does the job means a
// leak of this file's config gives an attacker nothing a browser did not
// already have.
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase backend environment variables')
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
)