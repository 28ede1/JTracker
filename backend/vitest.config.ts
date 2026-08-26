// ---------------------------------------------------------------------------
// Vitest config
//
// Tests share one database, so they must not run at the same time. Two tests
// creating and deleting rows in parallel would see each other's data and fail
// for reasons that have nothing to do with the code being tested.
// ---------------------------------------------------------------------------

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Loads .env before any test file runs, so DATABASE_URL is set.
    setupFiles: ["dotenv/config"],

    // Runs test files one after another instead of in parallel.
    fileParallelism: false,

    include: ["src/**/*.test.ts"],
  },
});
