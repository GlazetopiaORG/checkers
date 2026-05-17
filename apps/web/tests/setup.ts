/**
 * Vitest setup.
 *
 * Sets up environment variables required by the env loader. Tests use the
 * local Supabase started via `npm run db:start`. If integration tests are
 * run without a local Supabase, they will fail at the first DB call —
 * that's the correct failure mode.
 *
 * To skip integration tests when no DB is available:
 *   SKIP_INTEGRATION=1 npm test
 */

import { afterAll, beforeAll } from 'vitest';

import { _resetEnvForTests } from '../src/lib/env.js';
import { _resetSupabaseForTests } from '../src/lib/supabase.js';

beforeAll(() => {
  // Default env values for testing. CI / local can override.
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
  // Standard Supabase CLI default keys (well-known, safe in tests).
  process.env.SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  process.env.CHECKERS_JWT_SECRET ??=
    'test-jwt-secret-must-be-at-least-32-characters-long-here';
  process.env.CHECKERS_BOT_SHARED_SECRET ??=
    'test-bot-secret-must-be-at-least-32-characters-long-here';
  process.env.CHECKERS_GAME_URL ??= 'http://localhost:3000';
  process.env.CHECKERS_MARKS_REQUIRED ??= '3';
  process.env.CHECKERS_MIN_MOVES_FOR_WIN ??= '0'; // disable for tests
  process.env.CHECKERS_SESSION_TTL_MINUTES ??= '15';
  process.env.CHECKERS_COOLDOWN_SECONDS ??= '0'; // disable for tests
  process.env.CHECKERS_MAX_DAILY_SESSIONS ??= '100';
  // NODE_ENV is typed as a readonly string-literal union by Next.js'
  // global type augmentation. Bracket-access bypasses that narrowing
  // safely; the value is still a plain string at runtime.
  Object.assign(process.env, { NODE_ENV: process.env.NODE_ENV ?? 'test' });

  _resetEnvForTests();
  _resetSupabaseForTests();
});

afterAll(() => {
  // No-op for now. Cleanup hooks added here if needed.
});
