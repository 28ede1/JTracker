// ---------------------------------------------------------------------------
// Server
//
// Entry point. Loads .env first so DATABASE_URL exists before Prisma reads it.
// ---------------------------------------------------------------------------

import "dotenv/config";

import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
