// ---------------------------------------------------------------------------
// Username availability
//
// Owns one question: does JTracker's backend already have this username?
//
// It lives in its own file rather than inside signup.service.ts because it
// talks to a different system. Sign-up talks to Supabase Auth; this talks to
// our Express API. Keeping them apart means the sign-up flow can be read
// without HTTP details in the way, and this check can be reused later by a
// "change my username" screen that has nothing to do with signing up.
// ---------------------------------------------------------------------------

import { z } from 'zod'

import { API_URL } from '../../lib/api'

// ---------------------------------------------------------------------------
// Three answers, not two
//
// The mistake worth avoiding here is treating this as a yes/no question. A
// request can also simply fail: the backend is not running, the wifi dropped,
// the server returned a 500. That is not "available", and it is not "taken"
// either, so it gets its own case.
//
// Making it a third value rather than, say, returning false on error is what
// stops the caller from quietly guessing. TypeScript will not let anyone read
// this result without deciding what "unknown" should do.
// ---------------------------------------------------------------------------
export type UsernameAvailability =
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'unknown'; message: string }

// What GET /users/availability promises to send back. Checking it costs almost
// nothing and means a backend change, a proxy returning an HTML error page, or
// a typo in the field name is caught here as "unknown" instead of becoming
// undefined further down, where the bug is much harder to trace.
const availabilityBody = z.object({ available: z.boolean() })

export async function checkUsernameAvailability(
  username: string,

  // A parameter with a default, the same pattern as the Supabase client in
  // signup.service.ts: the app passes nothing and gets the browser's fetch, a
  // test passes a stand-in and never touches the network. That is Dependency
  // Inversion again, this file depends on the shape of fetch, not on the real
  // one.
  //
  // Wrapped in an arrow rather than written as "= fetch" because the browser
  // requires fetch to stay attached to window; handing the bare function around
  // detaches it and it throws when called.
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<UsernameAvailability> {
  // encodeURIComponent escapes characters that mean something in a URL, so a
  // name containing & or # is sent as text instead of being read as the start
  // of another query parameter.
  const url = `${API_URL}/users/availability?username=${encodeURIComponent(username)}`

  let response: Response

  // fetch only rejects when the request never completed at all: the server is
  // down, the connection dropped, the browser blocked it. A 404 or a 500 is a
  // completed request and does *not* land here, which is the single most
  // common misunderstanding about fetch. Both are handled, just separately.
  try {
    response = await fetcher(url)
  } catch {
    return {
      status: 'unknown',
      message: 'Could not reach JTracker. Check your connection and try again.',
    }
  }

  // The other half: the request arrived and the server said no. 400 means the
  // name broke the backend's own rules, anything 500-ish means the backend
  // broke. Neither tells us whether the name is free.
  if (!response.ok) {
    return {
      status: 'unknown',
      message: 'Could not check that username right now. Please try again.',
    }
  }

  let body: unknown

  // json() parses text into an object and throws if that text is not JSON,
  // which is exactly what an error page from a proxy would be.
  try {
    body = await response.json()
  } catch {
    return {
      status: 'unknown',
      message: 'Could not check that username right now. Please try again.',
    }
  }

  const parsed = availabilityBody.safeParse(body)

  if (!parsed.success) {
    return {
      status: 'unknown',
      message: 'Could not check that username right now. Please try again.',
    }
  }

  return parsed.data.available ? { status: 'available' } : { status: 'taken' }
}
