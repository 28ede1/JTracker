// ---------------------------------------------------------------------------
// User Service
//
// Talks to the database.
// ---------------------------------------------------------------------------

import { prisma } from "../../lib/prisma.ts"

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