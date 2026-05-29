/**
 * Phase 5.0.3: defense-in-depth env injection for the bot.
 * Mirrors apps/web/tests/_test-env.ts. See that file for full rationale.
 */

import { TEST_ENV_DEFAULTS } from './_test-env-defaults';

const toFill: Record<string, string> = {};
for (const [k, v] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (process.env[k] === undefined) toFill[k] = v;
}
if (Object.keys(toFill).length > 0) {
  Object.assign(process.env, toFill);
}

export { TEST_ENV_DEFAULTS as TEST_ENV };
