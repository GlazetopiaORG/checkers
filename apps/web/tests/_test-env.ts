/**
 * Phase 5.0.3: defense-in-depth env injection.
 *
 * The PRIMARY env-injection mechanism is `test.env` in `vitest.config.ts`,
 * which vitest applies to the test worker's process.env BEFORE any user
 * module loads. This file (`_test-env.ts`) exists as a belt-and-braces
 * runtime guard:
 *
 *   - Per-test imports (`import '../_test-env'` at the top of
 *     auth.test.ts, bot-client.test.ts, etc.) re-run the fill below to
 *     re-assert defaults in case anything cleared them mid-suite.
 *   - The setup file (`tests/setup.ts`) also imports this so the
 *     beforeAll/afterAll hooks can reset cached env without losing the
 *     baseline.
 *
 * Defaults live in `_test-env-defaults.ts` as pure constants so vitest
 * config and this runtime guard read from the same source. Adding a new
 * env var to the schema is a one-line change there.
 *
 * Fill-only semantics: a value already present in process.env (CI
 * override, `npm test -- --env FOO=bar`, etc.) always wins.
 *
 * Why Object.assign instead of property-by-property writes:
 *   `@types/node` declares `NODE_ENV` as a readonly string-literal union.
 *   Both `process.env.NODE_ENV = ...` and `process.env['NODE_ENV'] = ...`
 *   are rejected by strict typecheck. Object.assign treats the target as
 *   the wide `ProcessEnv` type and does not narrow on individual writes.
 */

import { TEST_ENV_DEFAULTS } from './_test-env-defaults';

const toFill: Record<string, string> = {};
for (const [k, v] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (process.env[k] === undefined) toFill[k] = v;
}
if (Object.keys(toFill).length > 0) {
  Object.assign(process.env, toFill);
}

// Re-export the defaults so tests that want to reference the baseline
// (e.g. for restoring after an intentional mutation) have a stable
// import path.
export { TEST_ENV_DEFAULTS as TEST_ENV };
