// ---------------------------------------------------------------------------
// User route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to be listening on a port.
//
// user.validation.test.ts covers the rules on their own and runs in
// milliseconds. These are the slower cases worth paying a round trip for.
//
// This file is the fussiest about cleanup in the backend, because it writes to
// the row belonging to the real test account rather than only to rows it
// invented. The Cleanup banner below is worth reading before changing anything
// here.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../../app.ts";
import { prisma } from "../../lib/prisma.ts";

const app = createApp();

// ---------------------------------------------------------------------------
// Refusals
//
// /users is mounted behind requireAuth, so a request without a token never
// reaches a handler. Refusing needs no account, so these two always run, even
// on a fresh clone with no test credentials.
// ---------------------------------------------------------------------------

describe("user routes without a token", () => {
  it("returns 401 for POST", async () => {
    const response = await request(app).post("/users").send({ username: "ada" });

    expect(response.status).toBe(401);
  });

  it("returns 401 for PATCH", async () => {
    const response = await request(app)
      .patch("/users")
      .send({ username: "ada" });

    expect(response.status).toBe(401);
  });

  it("returns 401 for GET /users/me", async () => {
    const response = await request(app).get("/users/me");

    expect(response.status).toBe(401);
  });

  // The availability check is the exception in this file: it is mounted ahead
  // of requireAuth, so a missing token is not what stops it. What stops it here
  // is a missing username, which is a plain validation failure and needs no
  // account and no data to test.
  //
  // Answering { available: false } instead would report "taken" to any form
  // that lost the parameter to a bug, which is the wrong way to be wrong.
  it("returns 400 for an availability check with no username", async () => {
    const response = await request(app).get("/users/availability");

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Credentials
//
// Everything below needs a real signed-in user, because the id a route writes
// comes from the token and nowhere else. When the two variables are missing the
// rest of the file skips instead of failing, the same way the other live tests
// do. See .env.example.
// ---------------------------------------------------------------------------

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

// ---------------------------------------------------------------------------
// Cleanup
//
// These tests run against the development database, so they have to remove
// exactly the rows they create and nothing else. There are two kinds.
//
// Stand-in users are deleted by name. Every one carries the prefix below, so a
// run that was interrupted partway through gets swept on the next start rather
// than piling rows up, and a test that fails before it can record an id is
// still cleaned up.
//
// The signed-in account's own row is deleted by id, because its username
// changes as the tests patch it and a name can never identify it reliably.
// Nothing survives the file: contact.routes.test.ts upserts this row itself
// before it needs it, so leaving it behind would only be clutter.
//
// The Supabase auth account behind TEST_USER_EMAIL is a different thing and is
// never touched. It has to outlive every run, and deleting one needs the secret
// key that lib/supabase.ts deliberately does not hold.
// ---------------------------------------------------------------------------

const TEST_PREFIX = "test-user-";

// The stand-in second account gets its own prefix so a test can tell "my row"
// from "somebody else's row" at a glance.
const OTHER_USER_PREFIX = "test-other-";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

describe.skipIf(!email || !password)("user routes", () => {
  // Filled in by beforeAll. The helpers below read them at call time, so they
  // are still empty when this file is first evaluated and that is fine.
  let token = "";
  let userId = "";

  // Turned on only once the safety check below has passed. Cleanup refuses to
  // delete the account's row until then, because vitest still runs afterEach
  // and afterAll when beforeAll throws, and that is exactly the moment the row
  // must be left alone.
  let mayDeleteAccountRow = false;

  // -------------------------------------------------------------------------
  // Safety check
  //
  // This file is different from the other route tests. POST /users can only
  // create the row belonging to the token, so testing it means deleting and
  // recreating the test account's own row. Every table that points at User
  // cascades on delete, so doing that to an account holding real contacts or
  // applications would destroy them.
  //
  // One query with _count asks the database how many rows the account owns.
  // Anything above zero stops the run with an explanation instead of deleting.
  // -------------------------------------------------------------------------

  async function failIfTestAccountOwnsData() {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            contacts: true,
            resumes: true,
            applications: true,
            alerts: true,
            fitAnalyses: true,
          },
        },
      },
    });

    // No row at all is the cleanest possible starting point.
    if (!user) return;

    const owned = Object.values(user._count).reduce(
      (total, count) => total + count,
      0,
    );

    if (owned > 0) {
      throw new Error(
        `TEST_USER_EMAIL owns ${owned} row(s). These tests delete and recreate ` +
          `that user row, and every table pointing at User cascades, so the ` +
          `data would be lost. Point TEST_USER_EMAIL at an account with no data.`,
      );
    }
  }

  // Removes everything this file writes: the stand-in users by name, and the
  // signed-in account's own row by id whatever username it is currently under.
  async function deleteTestUsers() {
    await prisma.user.deleteMany({
      where: { username: { startsWith: OTHER_USER_PREFIX } },
    });

    if (!mayDeleteAccountRow) return;

    await prisma.user.deleteMany({ where: { id: userId } });
  }

  beforeAll(async () => {
    // A client of its own rather than the shared one from lib/supabase.ts. That
    // client belongs to the server and should never hold one person's session.
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    );

    const { data, error } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });

    // A wrong password here is a broken test setup, not a failing feature, so
    // it stops the run immediately instead of failing every test below.
    if (error) {
      throw new Error(`Could not sign in as TEST_USER_EMAIL: ${error.message}`);
    }

    token = data.session!.access_token;
    userId = data.user!.id;

    await failIfTestAccountOwnsData();

    // Nothing above threw, so the account is empty and its row is safe to
    // delete. Everything below this line is allowed to clean up.
    mayDeleteAccountRow = true;

    // Clears strays from any earlier run that ended before it could clean up.
    await deleteTestUsers();
  });

  // Stops each test from seeing rows created by the test before it.
  afterEach(deleteTestUsers);

  // The last test leaves a row behind like any other, so this sweeps it. After
  // a full run the only trace of these tests is the Supabase auth account,
  // which is yours and has to stay.
  afterAll(deleteTestUsers);

  // -------------------------------------------------------------------------
  // Request helpers
  //
  // Every request needs the same header, so it lives in one place instead of
  // being repeated on thirty lines. Forgetting it on one test would turn a real
  // failure into a confusing 401. There is only one path per verb in this
  // module, so unlike the contact helpers these do not take one.
  // -------------------------------------------------------------------------

  function post(body: object) {
    return request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function patch(body: object) {
    return request(app)
      .patch("/users")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  // Stands in for a second person using the app. Built straight through Prisma
  // because there is no way to create another user over HTTP without their
  // token, and the point is to prove the scoping rather than to test sign-up.
  function otherUser(label: string) {
    return prisma.user.create({
      data: {
        id: randomUUID(),
        username: `${OTHER_USER_PREFIX}${label}`,
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET /users/availability
  //
  // Deliberately sends no Authorization header. Every other helper in this file
  // sets one; this one must not, because the people who call this endpoint are
  // partway through the sign-up form and have no token yet. A 401 from any test
  // below means the route slipped behind requireAuth in app.ts.
  // -------------------------------------------------------------------------

  function checkAvailability(username: string) {
    return request(app).get("/users/availability").query({ username });
  }

  describe("GET /users/availability", () => {
    // Clears the account's own row, so every TEST_PREFIX name starts unused.
    beforeEach(deleteTestUsers);

    it("answers without a token", async () => {
      const response = await checkAvailability(testName("free"));

      expect(response.status).toBe(200);
    });

    it("reports an unused username as available", async () => {
      const response = await checkAvailability(testName("free"));

      expect(response.body).toEqual({ available: true });
    });

    it("reports a username that is already stored as unavailable", async () => {
      const taken = await otherUser("taken");

      const response = await checkAvailability(taken.username);

      expect(response.body).toEqual({ available: false });
    });

    // The reply carries the answer and nothing else. Returning the row would
    // hand an anonymous caller another person's id, which is the whole risk of
    // having a public endpoint here.
    it("reveals nothing about the account holding the name", async () => {
      const taken = await otherUser("private");

      const response = await checkAvailability(taken.username);

      expect(Object.keys(response.body)).toEqual(["available"]);
    });

    // Trimmed by the same rule that trims it on the way in, so the check and
    // the create agree about what the name actually is.
    it("trims before checking", async () => {
      const taken = await otherUser("spaced");

      const response = await checkAvailability(`  ${taken.username}  `);

      expect(response.body).toEqual({ available: false });
    });

    // Documents a real limitation rather than hiding it. Postgres compares text
    // case-sensitively, so a different capitalisation is genuinely a free name
    // and a create would succeed. The check agrees with the database instead of
    // being stricter and refusing a name the user could actually have.
    it("treats a different capitalisation as a different name", async () => {
      const taken = await otherUser("case");

      const response = await checkAvailability(taken.username.toUpperCase());

      expect(response.body).toEqual({ available: true });
    });

    it("returns 400 when username is only whitespace", async () => {
      const response = await checkAvailability("   ");

      expect(response.status).toBe(400);
    });

    it("returns 400 when username is too long", async () => {
      const response = await checkAvailability("a".repeat(51));

      expect(response.status).toBe(400);
    });
  });

  describe("GET /users/me", () => {
    function getMe() {
      return request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
    }

    it("returns the signed-in user's row", async () => {
      await prisma.user.create({
        data: { id: userId, username: testName("mine") },
      });

      const response = await getMe();

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(userId);
      expect(response.body.username).toBe(testName("mine"));
    });

    // Having a token and having a user row are two different things, so this is
    // the state right after sign-up. The client uses this 404 to know it should
    // send the person through profile setup rather than into the app.
    it("returns 404 when the row has not been created yet", async () => {
      await deleteTestUsers();

      const response = await getMe();

      expect(response.status).toBe(404);
    });

    // The id is read from the token, never from the request, so there is no
    // input that could aim this at another row.
    it("does not return another user's row", async () => {
      const other = await otherUser("hidden");
      await prisma.user.create({
        data: { id: userId, username: testName("mine") },
      });

      const response = await getMe();

      expect(response.body.id).not.toBe(other.id);
      expect(response.body.username).not.toBe(other.username);
    });
  });

  describe("POST /users", () => {
    // Provisioning only makes sense from a state where the row is absent. The
    // afterEach above already clears it, and this makes the starting point
    // explicit so a change over there cannot quietly break these tests.
    beforeEach(deleteTestUsers);

    it("creates the user row and returns 201", async () => {
      const response = await post({ username: testName("created") });

      expect(response.status).toBe(201);
      expect(response.body.username).toBe(testName("created"));

      // Proves the row really reached the database rather than just echoing.
      const stored = await prisma.user.findUnique({ where: { id: userId } });
      expect(stored?.username).toBe(testName("created"));
    });

    // The important one. The id comes from the verified token, so a client
    // cannot create a row under somebody else's id.
    it("uses the id from the token", async () => {
      const response = await post({ username: testName("owned") });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe(userId);
    });

    // strict() at work end to end. The contact rules would drop an unexpected
    // id quietly; here the whole request is refused, and nothing is written.
    it("returns 400 when the body carries an id", async () => {
      const response = await post({
        username: testName("spoofed"),
        id: randomUUID(),
      });

      expect(response.status).toBe(400);

      const rows = await prisma.user.count({ where: { id: userId } });
      expect(rows).toBe(0);
    });

    it("returns 400 when username is missing", async () => {
      const response = await post({});

      expect(response.status).toBe(400);
    });

    it("returns 400 when username is only whitespace", async () => {
      const response = await post({ username: "   " });

      expect(response.status).toBe(400);
    });

    it("returns 400 when username is too long", async () => {
      const response = await post({ username: "a".repeat(51) });

      expect(response.status).toBe(400);
    });

    it("trims the username before storing it", async () => {
      const response = await post({ username: `  ${testName("spaced")}  ` });

      expect(response.status).toBe(201);
      expect(response.body.username).toBe(testName("spaced"));
    });

    // Provisioning runs once, just after sign-up. A second call hits the
    // primary key, which Prisma reports as P2002 and errorHandler turns into a
    // 409. Without that mapping the client would see a bare 500.
    it("returns 409 when the user has already been created", async () => {
      await post({ username: testName("first") });

      const response = await post({ username: testName("second") });

      expect(response.status).toBe(409);
    });

    // Username is unique across the whole table, so this is the other way the
    // same 409 is reached, and it is the one a real person will hit.
    it("returns 409 when the username is already taken", async () => {
      const taken = await otherUser("taken");

      const response = await post({ username: taken.username });

      expect(response.status).toBe(409);
    });
  });

  describe("PATCH /users", () => {
    // A patch needs a row to change, so every test starts from a known one.
    beforeEach(async () => {
      await prisma.user.upsert({
        where: { id: userId },
        create: { id: userId, username: testName("before") },
        update: { username: testName("before") },
      });
    });

    it("updates the username and returns 200", async () => {
      const response = await patch({ username: testName("after") });

      expect(response.status).toBe(200);
      expect(response.body.username).toBe(testName("after"));

      const stored = await prisma.user.findUnique({ where: { id: userId } });
      expect(stored?.username).toBe(testName("after"));
    });

    // The whole reason updateUser takes an id. Without that where clause a
    // patch would be free to rename anybody.
    it("changes only the signed-in user's row", async () => {
      const other = await otherUser("untouched");

      const response = await patch({ username: testName("mine") });

      expect(response.status).toBe(200);

      const stored = await prisma.user.findUnique({ where: { id: other.id } });
      expect(stored?.username).toBe(other.username);
    });

    it("returns 400 when the body carries an id", async () => {
      const other = await otherUser("target");

      const response = await patch({
        username: testName("spoofed"),
        id: other.id,
      });

      expect(response.status).toBe(400);

      // Nothing moved: the id in the body was neither obeyed nor ignored.
      const mine = await prisma.user.findUnique({ where: { id: userId } });
      expect(mine?.username).toBe(testName("before"));
    });

    it("returns 400 when username is missing", async () => {
      const response = await patch({});

      expect(response.status).toBe(400);
    });

    it("returns 400 when username is only whitespace", async () => {
      const response = await patch({ username: "   " });

      expect(response.status).toBe(400);
    });

    it("returns 400 when username is too long", async () => {
      const response = await patch({ username: "a".repeat(51) });

      expect(response.status).toBe(400);
    });

    it("trims the username before storing it", async () => {
      const response = await patch({ username: `  ${testName("spaced")}  ` });

      expect(response.status).toBe(200);
      expect(response.body.username).toBe(testName("spaced"));
    });

    it("returns 409 when the username is already taken", async () => {
      const taken = await otherUser("taken");

      const response = await patch({ username: taken.username });

      expect(response.status).toBe(409);
    });

    // Prisma reports a missing row as P2025, which errorHandler does not know
    // about, so this currently answers 500 when it should answer 404. Left as a
    // todo rather than a passing test, because asserting 500 would freeze the
    // behaviour in place and make the fix look like a regression.
    it.todo("returns 404 when the user row does not exist yet");
  });
});
