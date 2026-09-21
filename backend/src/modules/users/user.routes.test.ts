// ---------------------------------------------------------------------------
// User route tests
//
// The whole path end to end: a real HTTP request, through requireAuth and the
// validation rules and the service, to the real database and back. supertest
// drives the app object directly, so nothing has to listen on a port.
//
// This file is the fussiest about cleanup in the backend, because POST /users
// can only create the row belonging to the token, so testing it means deleting
// and recreating the real test account's own row. Read the safety check in
// beforeAll before changing anything here.
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

  it("returns 400 for an availability check with no username", async () => {
    const response = await request(app).get("/users/availability");

    expect(response.status).toBe(400);
  });
});

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

const TEST_PREFIX = "test-user-";

const OTHER_USER_PREFIX = "test-other-";

function testName(label: string) {
  return `${TEST_PREFIX}${label}`;
}

describe.skipIf(!email || !password)("user routes", () => {
  let token = "";
  let userId = "";

  let mayDeleteAccountRow = false;

  // Every table pointing at User cascades on delete, so recreating the test
  // account's row would destroy the contacts or applications of an account that
  // holds any. One query with _count asks how many rows it owns, and anything
  // above zero stops the run with an explanation instead of deleting.
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

  async function deleteTestUsers() {
    await prisma.user.deleteMany({
      where: { username: { startsWith: OTHER_USER_PREFIX } },
    });

    if (!mayDeleteAccountRow) return;

    await prisma.user.deleteMany({ where: { id: userId } });
  }

  beforeAll(async () => {
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
    );

    const { data, error } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });

    if (error) {
      throw new Error(`Could not sign in as TEST_USER_EMAIL: ${error.message}`);
    }

    token = data.session!.access_token;
    userId = data.user!.id;

    await failIfTestAccountOwnsData();

    mayDeleteAccountRow = true;

    await deleteTestUsers();
  });

  afterEach(deleteTestUsers);

  afterAll(deleteTestUsers);

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

  function otherUser(label: string) {
    return prisma.user.create({
      data: {
        id: randomUUID(),
        username: `${OTHER_USER_PREFIX}${label}`,
      },
    });
  }

  function checkAvailability(username: string) {
    return request(app).get("/users/availability").query({ username });
  }

  describe("GET /users/availability", () => {
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

    it("reveals nothing about the account holding the name", async () => {
      const taken = await otherUser("private");

      const response = await checkAvailability(taken.username);

      expect(Object.keys(response.body)).toEqual(["available"]);
    });

    it("trims before checking", async () => {
      const taken = await otherUser("spaced");

      const response = await checkAvailability(`  ${taken.username}  `);

      expect(response.body).toEqual({ available: false });
    });

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

    it("returns 404 when the row has not been created yet", async () => {
      await deleteTestUsers();

      const response = await getMe();

      expect(response.status).toBe(404);
    });

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
    beforeEach(deleteTestUsers);

    it("creates the user row and returns 201", async () => {
      const response = await post({ username: testName("created") });

      expect(response.status).toBe(201);
      expect(response.body.username).toBe(testName("created"));

      const stored = await prisma.user.findUnique({ where: { id: userId } });
      expect(stored?.username).toBe(testName("created"));
    });

    it("uses the id from the token", async () => {
      const response = await post({ username: testName("owned") });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe(userId);
    });

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

    it("returns the existing row without renaming it when called twice", async () => {
      await post({ username: testName("first") });

      const response = await post({ username: testName("second") });

      expect(response.status).toBe(201);
      expect(response.body.username).toBe(testName("first"));
    });


    it("returns 409 when the username is already taken", async () => {
      const taken = await otherUser("taken");

      const response = await post({ username: taken.username });

      expect(response.status).toBe(409);
    });
  });

  describe("PATCH /users", () => {
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
    // about, so this answers 500 where it should answer 404. Left as a todo
    // because asserting 500 would freeze that in place and make the fix look
    // like a regression.
    it.todo("returns 404 when the user row does not exist yet");
  });
});
