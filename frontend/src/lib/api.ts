// ---------------------------------------------------------------------------
// API base URL
//
// The one place that knows where JTracker's own Express backend lives.
//
// A hard-coded "http://localhost:3000" works on your laptop and nowhere else,
// so the address is read from VITE_API_URL in .env.local instead. Same idea as
// lib/supabase.ts: the value changes between your machine and a deployed site,
// the code does not.
//
// It also means the address is written down once. Ten files each spelling out
// localhost:3000 is ten places to edit on the day the API moves, and one of
// them will be missed.
// ---------------------------------------------------------------------------

const apiUrl = import.meta.env.VITE_API_URL

// Fail at startup with a clear message, rather than on the first request with a
// confusing "fetch failed" against the address "undefined/users".
if (!apiUrl) {
  throw new Error(
    'Missing VITE_API_URL. Copy .env.example to .env.local and fill in the values.',
  )
}

// A trailing slash in the variable would build "http://host//users", which some
// servers treat as a different path from "/users". Stripped once here rather
// than remembered at every call site.
export const API_URL = apiUrl.replace(/\/$/, '')
