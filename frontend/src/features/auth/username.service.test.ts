import { describe, expect, it } from 'vitest'

import { checkUsernameAvailability } from './username.service'

// ---------------------------------------------------------------------------
// Username availability tests
//
// Every test here hands the function a fake fetch instead of letting it reach
// the network. That is the point of taking fetch as a parameter: a 500, a
// dropped connection and a malformed body are all trivial to produce this way,
// and close to impossible to produce on demand against a real server.
//
// No backend has to be running for this file to pass.
//
// The four ways a request can fail are the reason this file exists. Getting
// "available" right is easy; the value is in proving that none of the failures
// are mistaken for it.
// ---------------------------------------------------------------------------

// Builds a fake fetch that answers with the status and body given. Response is
// a real browser class, so this produces the genuine article and the code under
// test cannot tell the difference.
function fakeFetch(status: number, body: string): typeof fetch {
  return async () => new Response(body, { status })
}

// The wording is asserted in full because it is the sentence the user reads
// when their sign-up is refused. Written once so the tests cannot drift apart.
const UNREACHABLE = 'Could not reach JTracker. Check your connection and try again.'
const UNCHECKABLE = 'Could not check that username right now. Please try again.'

// ---------------------------------------------------------------------------
// The two straightforward answers
// ---------------------------------------------------------------------------

describe('checkUsernameAvailability, a working backend', () => {
  it('reports a free username as available', async () => {
    const result = await checkUsernameAvailability(
      'bob2',
      fakeFetch(200, JSON.stringify({ available: true })),
    )

    expect(result).toEqual({ status: 'available' })
  })

  it('reports a used username as taken', async () => {
    const result = await checkUsernameAvailability(
      'bob2',
      fakeFetch(200, JSON.stringify({ available: false })),
    )

    expect(result).toEqual({ status: 'taken' })
  })
})

// ---------------------------------------------------------------------------
// The URL that gets built
//
// Worth its own test because the backend refuses anything it cannot parse, and
// a name containing & or # would otherwise be read as the start of another
// query parameter rather than as part of the username.
// ---------------------------------------------------------------------------

describe('checkUsernameAvailability, the request', () => {
  it('escapes characters that mean something in a URL', async () => {
    let requested: string | undefined

    const recordingFetch: typeof fetch = async (input) => {
      requested = String(input)
      return new Response(JSON.stringify({ available: true }), { status: 200 })
    }

    await checkUsernameAvailability('a&b c#d', recordingFetch)

    // The name arrives as one encoded value. Without encodeURIComponent the
    // backend would see a username of "a", an empty parameter "b c", and
    // nothing at all after the #, which a browser never even sends.
    expect(requested).toContain('username=a%26b%20c%23d')
  })

  it('asks the availability endpoint', async () => {
    let requested: string | undefined

    const recordingFetch: typeof fetch = async (input) => {
      requested = String(input)
      return new Response(JSON.stringify({ available: true }), { status: 200 })
    }

    await checkUsernameAvailability('bob2', recordingFetch)

    expect(requested).toContain('/users/availability')
  })
})

// ---------------------------------------------------------------------------
// The four failures
//
// All four produce "unknown" rather than a yes or a no. Grouping them in one
// describe is deliberate: the shared expectation is the lesson. A caller only
// ever has to handle three answers, no matter how many ways the request can go
// wrong underneath.
// ---------------------------------------------------------------------------

describe('checkUsernameAvailability, failures', () => {
  // 1. The request never completed. This is the only case fetch itself reports
  //    by rejecting: the server is down, the connection dropped, or the browser
  //    blocked it for CORS.
  it('reports a network failure as unknown', async () => {
    const failingFetch: typeof fetch = async () => {
      throw new TypeError('Failed to fetch')
    }

    const result = await checkUsernameAvailability('bob2', failingFetch)

    expect(result).toEqual({ status: 'unknown', message: UNREACHABLE })
  })

  // 2. The request completed and the server refused. The important thing about
  //    these two is that fetch does *not* throw for them. Code that only wraps
  //    the call in try/catch would sail past a 500 and then read available off
  //    an error body, where it is undefined, and treat the name as taken.
  it('reports a 500 as unknown', async () => {
    const result = await checkUsernameAvailability(
      'bob2',
      fakeFetch(500, JSON.stringify({ error: 'Something broke' })),
    )

    expect(result).toEqual({ status: 'unknown', message: UNCHECKABLE })
  })

  // A 400 is the backend saying the name broke its own rules. That is still not
  // an answer to "is this free", so it is not treated as one.
  it('reports a 400 as unknown', async () => {
    const result = await checkUsernameAvailability(
      '',
      fakeFetch(400, JSON.stringify({ error: 'Invalid username' })),
    )

    expect(result).toEqual({ status: 'unknown', message: UNCHECKABLE })
  })

  // 3. A 200 carrying something that is not JSON at all, which is what an error
  //    page from a proxy or a load balancer looks like.
  it('reports an unparseable body as unknown', async () => {
    const result = await checkUsernameAvailability(
      'bob2',
      fakeFetch(200, '<html><body>502 Bad Gateway</body></html>'),
    )

    expect(result).toEqual({ status: 'unknown', message: UNCHECKABLE })
  })

  // 4. Valid JSON in the wrong shape. This is the one that would otherwise slip
  //    through silently: available would read as undefined, undefined is
  //    falsy, and every username in the app would start coming back as taken.
  it('reports a body missing the available field as unknown', async () => {
    const result = await checkUsernameAvailability(
      'bob2',
      fakeFetch(200, JSON.stringify({ taken: false })),
    )

    expect(result).toEqual({ status: 'unknown', message: UNCHECKABLE })
  })

  // The same trap from the other direction. A string "false" is not a boolean
  // false, and JavaScript would happily treat the non-empty string as true.
  it('reports a non-boolean available field as unknown', async () => {
    const result = await checkUsernameAvailability(
      'bob2',
      fakeFetch(200, JSON.stringify({ available: 'false' })),
    )

    expect(result).toEqual({ status: 'unknown', message: UNCHECKABLE })
  })

  // Never throws, whatever happens. The sign-up service calls this without a
  // try/catch of its own, so an escaping error would take down the whole
  // sign-up with an unhandled rejection instead of a readable message.
  it('never throws, whatever the response', async () => {
    const explodingFetch: typeof fetch = async () => {
      throw new Error('something nobody predicted')
    }

    await expect(checkUsernameAvailability('bob2', explodingFetch)).resolves.toEqual({
      status: 'unknown',
      message: UNREACHABLE,
    })
  })
})
