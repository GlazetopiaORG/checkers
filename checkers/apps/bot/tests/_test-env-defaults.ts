/**
 * Bot test env defaults — PURE CONSTANTS.
 * Mirrors apps/web/tests/_test-env-defaults.ts. See that file for the
 * full Phase 5.0.3 rationale.
 */

export const TEST_ENV_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  DISCORD_BOT_TOKEN: 'test-discord-token-not-real',
  DISCORD_APPLICATION_ID: '111111111111111111',
  DISCORD_GUILD_ID: '222222222222222222',
  // Phase 5: snowflake-shaped role id for tests that exercise role grants.
  DISCORD_LEVEL_PASSED_ROLE_ID: '333333333333333333',
  CHECKERS_BACKEND_URL: 'http://localhost:3000',
  CHECKERS_BOT_SHARED_SECRET: 'test-bot-secret-must-be-at-least-32-characters-long-here',
  // 0 = OS-assigned ephemeral port (Node convention). Avoids port
  // conflicts when tests run in parallel.
  BOT_HTTP_PORT: '0',
  BOT_COMMAND_COOLDOWN_SECONDS: '0',
  NODE_ENV: 'test',
});
