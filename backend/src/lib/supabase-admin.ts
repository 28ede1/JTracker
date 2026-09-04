// ---------------------------------------------------------------------------
// Supabase admin client (server side)
//
// Creates one shared Supabase client for backend operations that require the
// secret key, such as uploading resumes to the private Storage bucket.
//
// The secret key bypasses Row Level Security, so this client does not determine
// whether a user is allowed to access a resume. The route must first run
// requireAuth, and the service must use the verified user ID when creating,
// retrieving, or deleting files.
//
// This file must never be imported by the frontend, and the secret key must
// never be committed to GitHub.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing Supabase admin environment variables");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  // This client belongs to the server, not to a signed in person. Without
  // these, the library tries to store and refresh a session, and on a server
  // one request's identity could leak into the next one's.
  auth: { persistSession: false, autoRefreshToken: false },
});