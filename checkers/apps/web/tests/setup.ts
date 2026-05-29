/**
 * Vitest setup file.
 *
 * ORDER MATTERS:
 *   1. _test-env is imported FIRST. It populates process.env at module
 *      load time, before any other import in the graph can evaluate.
 *      This protects against any top-level (or describe-body) call to
 *      `getEnv()` triggering schema validation before our seed.
 *   2. _resetEnvForTests / _resetSupabaseForTests are imported after
 *      env exists. Their hooks fire in beforeAll/beforeEach to clear
 *      cached state between tests.
 *
 * If you find yourself adding new env vars to the schema:
 *   - Add the test-safe default to tests/_test-env.ts
 *   - Do NOT add it here — `_test-env` is the single source of truth.
 *
 * To skip integration tests when no DB is available:
 *   SKIP_INTEGRATION=1 npm test
 */

// MUST be first: side-effect import that seeds process.env.
import './_test-env';

import { afterAll, beforeAll } from 'vitest';

import { _resetEnvForTests } from '../src/lib/env';
import { _resetSupabaseForTests } from '../src/lib/supabase';

beforeAll(() => {
  // Defensive: clear any cached env/supabase from a prior run (vitest
  // forks). The env is already populated by _test-env at import time.
  _resetEnvForTests();
  _resetSupabaseForTests();
});

afterAll(() => {
  // No-op for now. Cleanup hooks added here if needed.
});
