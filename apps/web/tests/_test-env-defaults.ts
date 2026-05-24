/**
 * Test env defaults — PURE CONSTANTS, no side effects.
 *
 * Phase 5.0.3: This module exists separately from `_test-env.ts` so it
 * can be imported by `vitest.config.ts` and injected via the `test.env`
 * config option. That option populates process.env on the test worker
 * BEFORE any user module evaluates — earlier than even setupFiles.
 *
 * `_test-env.ts` still imports from here so the runtime defaults match
 * the vitest-injected defaults exactly. Single source of truth.
 *
 * DO NOT add side effects to this file. It must be safe to import from
 * any context (vitest config, test setup, test bodies) without mutating
 * anything.
 */

export const TEST_ENV_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  SUPABASE_URL: 'http://127.0.0.1:54321',
  // Standard Supabase CLI default keys (well-known JWTs, safe in tests).
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  CHECKERS_JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-characters-long-here',
  CHECKERS_BOT_SHARED_SECRET: 'test-bot-secret-must-be-at-least-32-characters-long-here',
  CHECKERS_GAME_URL: 'http://localhost:3000',
  CHECKERS_MARKS_REQUIRED: '3',
  CHECKERS_MIN_MOVES_FOR_WIN: '0',
  CHECKERS_SESSION_TTL_MINUTES: '15',
  CHECKERS_COOLDOWN_SECONDS: '0',
  CHECKERS_MAX_DAILY_SESSIONS: '100',
  NODE_ENV: 'test',
});
