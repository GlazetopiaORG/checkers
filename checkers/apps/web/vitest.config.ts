import { defineConfig } from 'vitest/config';

import { TEST_ENV_DEFAULTS } from './tests/_test-env-defaults';

/**
 * Phase 5.0.3: test.env vs setupFiles vs per-file imports.
 *
 * Vitest gives us three layers to inject test environment values, in
 * load order:
 *
 *   1. `test.env` (this file)        — populated on the test worker's
 *                                       process.env BEFORE any user
 *                                       module evaluates. Earliest
 *                                       possible injection point.
 *   2. `setupFiles` (tests/setup.ts) — runs per test file, before the
 *                                       test file is loaded. Used for
 *                                       hooks (beforeAll/afterAll).
 *   3. Per-test-file `import '../_test-env';` (in auth.test.ts,
 *      bot-client.test.ts, etc.)    — defense-in-depth, ensures env is
 *                                       seeded even if the worker
 *                                       somehow bypassed layer 1.
 *
 * Layers 1, 2, and 3 all reference the SAME constants in
 * `_test-env-defaults.ts` so they cannot drift. If a test mutates a
 * value, `_resetEnvForTests()` in `setup.ts`'s beforeAll restores the
 * cached env to nothing, forcing a fresh re-parse with the (still
 * correct) injected values.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Belt-and-braces: explicitly exclude .js artifacts in case any stale
    // compiled files exist alongside the .ts sources.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/*.js',
      '**/*.d.ts',
    ],
    // Layer 1: inject before any user module evaluates. This is the fix
    // for tests that import env-aware modules at file top — the env is
    // already populated on the worker by the time imports resolve.
    env: TEST_ENV_DEFAULTS,
    // Layer 2: setup hooks.
    setupFiles: ['./tests/_test-env.ts', './tests/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
