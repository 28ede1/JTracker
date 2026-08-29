// ---------------------------------------------------------------------------
// requireAuth tests
//
// /contacts is used as the subject because it is the route the middleware is
// mounted on. Testing through a real route proves the wiring in app.ts, not
// just the function, which is the part that actually breaks.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.ts";

const app = createApp();

// The refusals need no account, so these three always run.
describe("requireAuth rejects", () => {
  it("returns 401 when there is no Authorization header", async () => {
    const response = await request(app).get("/contacts");

    expect(response.status).toBe(401);
  });

  it("returns 401 when the scheme is not Bearer", async () => {
    const response = await request(app)
      .get("/contacts")
      .set("Authorization", "Basic someuser:somepassword");

    expect(response.status).toBe(401);
  });

  // The token is well formed as a header but meaningless to Supabase, which is
  // what an expired or edited token looks like from here.
  it("returns 401 when the token is not a real one", async () => {
    const response = await request(app)
      .get("/contacts")
      .set("Authorization", "Bearer not-a-real-token");

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// The accepting half needs a real signed-in user, so it needs credentials.
// Without them the test skips rather than fails, the same way the frontend
// live tests do, so a fresh clone still runs green.
// ---------------------------------------------------------------------------

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

describe("requireAuth accepts", () => {
  it.skipIf(!email || !password)(
    "returns 200 for a real access token",
    async () => {
      // A client of its own, not the shared one from lib/supabase.ts. The
      // shared client belongs to the server and should never be holding one
      // particular person's session.
      const client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
      );

      const { data, error } = await client.auth.signInWithPassword({
        email: email!,
        password: password!,
      });

      // A wrong password here is a broken test setup, not a failing feature, so
      // it is worth saying so plainly.
      expect(error, "could not sign in with TEST_USER_EMAIL").toBeNull();

      const response = await request(app)
        .get("/contacts")
        .set("Authorization", `Bearer ${data.session!.access_token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    },
  );
});
