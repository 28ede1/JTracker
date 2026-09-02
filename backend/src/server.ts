// ---------------------------------------------------------------------------
// Server
//
// The entry point, and the only file that opens a port. app.ts builds the app
// and this starts it, which is what lets a test import the app without one.
//
// "npm run dev" runs this file, because package.json points its dev script at
// "tsx watch src/server.ts".
//
// The import order is the important part. "dotenv/config" runs first and loads
// .env into process.env, and only then does importing createApp pull in app.ts
// and everything app.ts imports, including lib/prisma.ts. Prisma reads
// DATABASE_URL the moment it is loaded, so a later dotenv would be too late.
// ---------------------------------------------------------------------------

import "dotenv/config";

import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
