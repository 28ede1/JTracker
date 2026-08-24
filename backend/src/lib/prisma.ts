// ---------------------------------------------------------------------------
// Prisma client
//
// One client for the whole app. Each PrismaClient opens its own pool of
// database connections, so creating one per request would exhaust the Supabase
// pooler quickly. Sharing a single instance keeps connection use flat.
// ---------------------------------------------------------------------------

import { PrismaClient } from "../../generated/prisma/client.ts";

export const prisma = new PrismaClient();
