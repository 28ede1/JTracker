// ---------------------------------------------------------------------------
// Prisma CLI config
//
// Read by the prisma command, not by the running app. Requires prisma and
// dotenv as dev dependencies.
//
// The import of "dotenv/config" loads backend/.env into process.env before the
// CLI reads the schema, so env("DATABASE_URL") and env("DIRECT_URL") in
// prisma/schema.prisma resolve. Same ordering trick as src/server.ts.
//
// Connection URLs are deliberately not set here. They stay in the datasource
// block of prisma/schema.prisma, so there is one place that decides where the
// database is.
//
// On Prisma 6.x this file is an Early Access feature, which is why
// earlyAccess: true is required below.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
});
