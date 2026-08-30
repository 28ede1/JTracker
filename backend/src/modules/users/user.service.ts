// ---------------------------------------------------------------------------
// User Service
//
// Talks to the database.
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

export function createUser(
  id: string,
  data: {
    username: string
  },
) {
  return prisma.user.create({
    data: {
      id,
      username: data.username,
    },
  })
}

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