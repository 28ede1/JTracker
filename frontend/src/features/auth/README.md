# Auth (frontend)

## Layering

Each service (login, signup, signout, etc.) is broken up into three layers:

- **`*.validation.ts`** validates input before any auth method is called: email and password checks.
- **`*.service.ts`** talks directly to Supabase while performing auth operations.
- **`*Testing.tsx`** frontend components that accept email and password input, or trigger signout on the client, and call the services that perform the auth operation.

## Result objects instead of thrown errors

Every service returns a shape like this:

```ts
type SignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; message: string }
```

Extra fields such as `needsEmailConfirmation` ride along for callers that want
to do something more specific, without the existing error branch being touched.

## Injecting the client (for integration testing)

Each service takes the Supabase client as a parameter with a default:

```ts
export async function signUpWithEmail(
  input: unknown,
  client: SupabaseClient = supabase,
)
```

The app passes nothing and gets the shared client from `lib/supabase.ts`; a
test passes its own stand-in. That is what lets the tests drive error branches
without making Supabase actually fail.

## What Supabase does during each call (system design)

**Sign up** (`auth.signUp`)

1. Receives the email and password over HTTPS.
2. Checks whether an Auth account already exists.
3. Hashes the password and creates a user in Supabase Auth.
4. Sends a confirmation email, if email confirmation is enabled.
5. Returns the new user, and a session only if no confirmation is needed.

With confirmation enabled, Supabase creates the user but returns **no session**.

**Log in** (`auth.signInWithPassword`)

1. Finds the existing Auth account.
2. Verifies the supplied password against the stored hash.
3. Creates a session and returns an access token and a refresh token.

**Sign out** (`auth.signOut`)

1. Supabase revokes the session's refresh token.
2. The Supabase client deletes its locally stored session, so protected requests
   to the Express API no longer carry a valid token.

## Sessions and access tokens

A session represents an ongoing authenticated login. It holds user information,
an access token, a refresh token, and expiry information. The Supabase client
stores it in the browser and refreshes the access token on its own as it nears
expiry.

The access token is a short-lived JWT carrying claims about the identity:

| Claim   | Meaning                        |
| ------- | ------------------------------ |
| `sub`   | The Supabase user's unique ID  |
| `email` | The user's email               |
| `role`  | Normally `authenticated`       |
| `exp`   | When the access token expires  |

The frontend sends this token to protected Express endpoints, which verify it
before trusting any of its claims. So the two are separate:

- A usable **frontend session** means the browser treats the user as logged in.
- A verified **access token** means Express can trust who sent a request.

## Who owns what data

Supabase Auth owns identity and credentials: the user ID, email, password hash,
and confirmation state. JTracker's own database, through Prisma, owns everything
else: applications, resumes, contacts, and alerts. The Supabase user ID links
the two.

## Validation is a convenience, not a security boundary

The rules in `*.validation.ts` run before the network is touched, so a typo is
reported instantly instead of after a round trip.

## Running the tests

Each service and validation file has a `.test.ts` beside it. The service suites
are grouped by what they test:

1. **Invalid input** proves bad input is rejected before Supabase is called.
   These pass a client that throws if it is ever touched, so "no request was
   sent" is proven rather than assumed.
2. **Injected client** uses a stand-in that answers however the test needs, to
   reach branches that are awkward or expensive to trigger for real.
3. **Real Supabase Auth** makes actual network calls against the project.

Group 3 needs two variables in `frontend/.env.local`, named without the `VITE_`
prefix so they reach the tests and never the browser bundle:

```
SIGNUP_TEST_EMAIL=you@example.com
LOGIN_TEST_PASSWORD=<password of the confirmed test account>
```

When they are unset, the live tests are reported as **skipped** rather than
failed, so the suite still passes on a machine that has not been set up for them.

### Costs and cleanup

A live sign-up creates a **real auth user**. The publishable key cannot delete
it, only the secret key this app deliberately never holds, so remove them by
hand in the Supabase dashboard under Authentication > Users. Every test address
starts with `jtracker-test`, so they are easy to find and delete together.

### The one account you set up by hand

Some tests need an account that already exists and is **confirmed**:
`you+jtracker-test-registered@…`. Sign up with that address once, then click the
confirmation link in the inbox.

Confirmed is the important word. Signing up again against an existing but
*unconfirmed* account is read by Supabase as "resend my confirmation email",
which is capped at about one per minute, so the call comes back as a rate-limit
error instead of the duplicate response the test is about.

### Why some tests assert on the whole result object

Supabase deliberately does not say "that email is taken", and answers a wrong
password and an unknown address in identical words. Either difference would let
anyone probe the project to learn who has an account here.

Several tests therefore assert on the entire result object, not just `ok`, so a
future change that leaks that distinction, or hands back a live session for an
existing account, fails loudly instead of passing quietly.
