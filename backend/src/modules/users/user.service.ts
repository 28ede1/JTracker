// ---------------------------------------------------------------------------
// User service
//
// Talks to the database. Nothing here knows about Express, so these functions
// can also be called later by a script or a test, not just by a web request.
//
// Every function takes the id as its first argument and that id always comes
// from a verified token, never from a body or a query string. See
// middleware/require-auth.ts for why that split is the whole privacy story.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts"

// The signed-in user's own row. findUnique because id is the primary key, and
// there is no ownership check to add: the id already came from a verified
// token, so this can only ever read the caller's own row.
export function findUser(id: string) {
  return prisma.user.findUnique({
    where: {
      id: id,
    },
  })
}

// ---------------------------------------------------------------------------
// Is this username taken?
//
// Returns a boolean, never a row. That is the point of the function. A public
// route calls this, so if it handed back a User the route could leak somebody
// else's id by forwarding it. Narrowing the return type means that mistake
// cannot be made here at all.
//
// count is used rather than findUnique for the same reason: the database
// answers with a number, so no user row is ever loaded into memory.
//
// Postgres compares text case-sensitively and the unique index on username does
// too, so "ada" and "Ada" are two different names. This function matches that
// behaviour on purpose. It reports exactly what a create would do, rather than
// being kinder than the constraint and disagreeing with it later.
// ---------------------------------------------------------------------------
export async function isUsernameTaken(username: string) {
  const matches = await prisma.user.count({
    where: {
      username: username,
    },
  })

  return matches > 0
}

// ---------------------------------------------------------------------------
// ensureUser
//
// Creates the row if it is missing, returns it if it is already there. Called
// every time a session appears, which means it is called far more often than
// there are rows to create, so "already exists" has to be a normal outcome
// rather than an error.
//
// upsert rather than a findUnique followed by a create. Two statements leave a
// gap: two requests from the same person, a double-clicked button or a tab
// restored beside another, can both read "no row" and both go on to create one,
// and the second gets a unique-constraint error. upsert is a single statement,
// so the database settles it instead of the gap.
//
// update is deliberately empty. The row already has a username that the unique
// index accepted, while the value in this request came from user_metadata,
// which a signed-in person can rewrite for themselves with auth.updateUser. If
// update set the username, anyone could put somebody else's name in their own
// metadata and take it on the next page load. Empty means a repeat call can
// never rename anyone. Renaming has its own route, updateUser, where it is an
// explicit request rather than a side effect.
// ---------------------------------------------------------------------------
export function ensureUser(
  id: string,
  data: {
    username: string
  },
) {
  return prisma.user.upsert({
    where: {
      id: id,
    },
    update: {},
    create: {
      id,
      username: data.username,
    },
  })
}

// Renaming, and the only place a username ever changes. ensureUser deliberately
// will not do it, so this is the one path, and it is an explicit request rather
// than a side effect of signing in.
//
// A clash is left to the database. The unique index on username refuses the
// write, Prisma raises P2002, and errorHandler turns that into a 409. Checking
// first and then updating would leave a gap for two people to pass the check
// and only one to succeed, so the constraint is allowed to be the referee.
export function updateUser(
    id: string,
    data: {
      username: string
    },
  ) {
    return prisma.user.update({
      where: {
        id: id,
      },
      data: {
        username: data.username,
      },
    })
  }