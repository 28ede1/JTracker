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

    // Prints the description of every test, not just a per file summary. The
    // default reporter only expands a file when it is slow or fails, which
    // hides fast tests like the validation ones.
    reporters: ["verbose"],

    include: ["src/**/*.test.ts"],
  },
});
