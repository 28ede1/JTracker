// Prisma CLI configuration.
// Requires: npm install --save-dev prisma dotenv
//
// The import of "dotenv/config" loads backend/.env into process.env before the
// Prisma CLI reads the schema, so env("DATABASE_URL") and env("DIRECT_URL") in
// prisma/schema.prisma resolve correctly.
//
// Note: on Prisma 6.x this config file is an Early Access feature, so
// earlyAccess: true is required. Connection URLs are NOT set here; they are
// declared in the datasource block of prisma/schema.prisma.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
});
