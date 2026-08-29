// ---------------------------------------------------------------------------
// Vitest config (frontend)
//
// Separate from vite.config.ts, matching the backend's layout. Vitest uses this
// file *instead of* vite.config.ts, not in addition to it, so the React plugin
// is absent here. That is fine because these tests import plain .ts modules and
// never render a component.
//
// Vite still loads .env.local by itself, so import.meta.env.VITE_SUPABASE_URL
// and the publishable key reach the Supabase client during a test run without
// any extra setup.
// ---------------------------------------------------------------------------

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // loadEnv reads .env.local directly. The empty prefix means "load everything",
  // not just VITE_ variables, which is the point: SIGNUP_TEST_EMAIL is a real
  // inbox address and must never be bundled into the app that ships to
  // browsers. Only the one variable named below is handed to the tests, so
  // nothing else from the file leaks in either.
  // '.' is this folder. Using it instead of process.cwd() keeps the config free
  // of Node type definitions, which the frontend does not otherwise need.
  const env = loadEnv(mode, '.', '')

  return {
    test: {
      env: {
        SIGNUP_TEST_EMAIL: env.SIGNUP_TEST_EMAIL ?? '',
      },

      // Runs test files one after another instead of in parallel. The sign-up
      // tests hit the real project, and Supabase rate limits sign-ups per hour,
      // so parallel files would burn that budget faster for no benefit.
      fileParallelism: false,

      // Prints the description of every test, not just a per file summary.
      reporters: ['verbose'],

      include: ['src/**/*.test.ts'],

      // A real sign-up is a network round trip plus an email send, which is
      // well past the 5 second default.
      testTimeout: 20000,
    },
  }
})
