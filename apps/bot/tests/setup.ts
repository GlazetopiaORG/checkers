/**
 * Bot vitest setup.
 *
 * Mirrors the web setup pattern:
 *   1. `_test-env` runs first (side-effect import) to seed process.env
 *   2. Reset cached env between test files so a mutation in one suite
 *      doesn't poison the next
 */

import './_test-env';

import { afterAll, beforeAll } from 'vitest';

import { _resetEnvForTests } from '../src/env';

beforeAll(() => {
  _resetEnvForTests();
});

afterAll(() => {
  // No-op for now.
});
