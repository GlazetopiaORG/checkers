import { defineConfig } from 'vitest/config';

import { TEST_ENV_DEFAULTS } from './tests/_test-env-defaults';

/**
 * Phase 5.0.3: see apps/web/vitest.config.ts for the full rationale.
 *
 * Three-layer env injection:
 *   1. `test.env` — populated on worker process.env BEFORE any user code
 *   2. `setupFiles` — re-runs the runtime guard per test file
 *   3. Per-test imports — defense in depth
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.js',
      '**/*.d.ts',
    ],
    env: TEST_ENV_DEFAULTS,
    setupFiles: ['./tests/_test-env.ts', './tests/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15_000,
  },
});
