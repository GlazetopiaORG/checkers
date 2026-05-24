/**
 * Environment variable loader and validator.
 *
 * Fails loudly at startup if a required env var is missing or malformed —
 * better to crash on boot than silently misbehave at request time.
 *
 * All env access in the app MUST go through this module. Do not read
 * `process.env` directly elsewhere.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Backend secrets
  CHECKERS_JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 chars'),
  CHECKERS_BOT_SHARED_SECRET: z
    .string()
    .min(32, 'Bot shared secret must be at least 32 chars'),

  // URLs
  CHECKERS_GAME_URL: z.string().url(),

  // Progression
  CHECKERS_MARKS_REQUIRED: z.coerce.number().int().positive().default(3),

  // Anti-cheat tunables
  CHECKERS_MIN_MOVES_FOR_WIN: z.coerce.number().int().nonnegative().default(10),
  CHECKERS_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  CHECKERS_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(30),
  CHECKERS_MAX_DAILY_SESSIONS: z.coerce.number().int().positive().default(20),

  // Phase 5: Discord role assignment via the bot's internal HTTP endpoint.
  // The bot exposes POST /internal/grant-role on this URL (HMAC-signed via
  // CHECKERS_BOT_SHARED_SECRET — the same shared secret used by the bot for
  // its outbound calls into web). Optional during local dev: if unset, the
  // web backend logs the would-be grant and continues. In production it
  // must be set or you'll silently never grant the role.
  CHECKERS_BOT_INTERNAL_URL: z.string().url().optional(),

  // The Discord role granted when EITHER opponent path is passed. Read by
  // the bot at startup. Web doesn't actually consume this value at runtime
  // (the bot looks it up) but we keep it here so misconfiguration is
  // visible in one place.
  DISCORD_LEVEL_PASSED_ROLE_ID: z.string().optional(),

  // Node env
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the cache. ONLY for tests. */
export function _resetEnvForTests(): void {
  cached = null;
}
