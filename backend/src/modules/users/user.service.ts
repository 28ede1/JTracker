// ---------------------------------------------------------------------------
// User service
//
// Directly talks to the database. Meant to be called only after client input
// has been normalized and checked.
//
// Every function takes the id first, and that id always comes from a verified
// token, never from a body or a query string. See middleware/require-auth.ts.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts"

// findUnique because id is the primary key, and no ownership check is needed:
// the id came from a verified token, so this only ever reads the caller's row.
export function findUser(id: string) {
  return prisma.user.findUnique({
    where: {
      id: id,
    },
  })
}

// Returns a boolean, never a row, because a public route calls this and a User
// would leak somebody else's id. Postgres compares text case-sensitively and so
// does the unique index, so "ada" and "Ada" are two different names.
export async function isUsernameTaken(username: string) {
  const matches = await prisma.user.count({
    where: {
      username: username,
    },
  })

  return matches > 0
}

// Creates the row if it is missing, returns it if it is already there. upsert
// rather than findUnique then create, because two statements leave a gap where
// two requests from the same person both read "no row" and both try to create.
//
// update is empty on purpose: the username here came from user_metadata, which
// a signed-in person can rewrite, so renaming goes through updateUser instead.
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

// A clash is left to the database: the unique index refuses the write, Prisma
// raises P2002, and errorHandler turns that into a 409. Checking first would
// leave a gap where two people pass the check and only one succeeds.
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