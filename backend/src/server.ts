// ---------------------------------------------------------------------------
// Server
//
// Entry point. Loads .env first so DATABASE_URL exists before Prisma reads it.
// ---------------------------------------------------------------------------
// 'npm run dev' command runs server.ts bc of the 
// "dev": "tsx" watch src/server.ts instruction in package.json
//
// note that importing createApp will run every file (including imports)
// that exist in app.ts


import "dotenv/config";

import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
