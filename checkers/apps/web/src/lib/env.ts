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

  // Discord (used in Phase 4 but read here for completeness; optional in Phase 2)
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
