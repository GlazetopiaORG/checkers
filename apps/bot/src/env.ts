/**
 * Environment variable loader for the Discord bot.
 *
 * The bot deliberately has access to fewer secrets than the backend:
 *   - No Supabase keys (bot never touches the DB)
 *   - No JWT secret (only the backend signs/verifies session tokens)
 *
 * What it DOES need:
 *   - DISCORD_BOT_TOKEN          — secret; gateway auth
 *   - DISCORD_APPLICATION_ID     — public; for command registration
 *   - DISCORD_GUILD_ID           — public; per-guild command registration
 *   - CHECKERS_BACKEND_URL       — public; base URL for API calls
 *   - CHECKERS_BOT_SHARED_SECRET — secret; HMAC for backend auth
 *
 * Fails loudly at startup if anything required is missing.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  DISCORD_APPLICATION_ID: z
    .string()
    .regex(/^\d{15,25}$/, 'DISCORD_APPLICATION_ID must be a numeric snowflake'),
  DISCORD_GUILD_ID: z
    .string()
    .regex(/^\d{15,25}$/, 'DISCORD_GUILD_ID must be a numeric snowflake'),

  CHECKERS_BACKEND_URL: z.string().url('CHECKERS_BACKEND_URL must be a URL'),
  CHECKERS_BOT_SHARED_SECRET: z
    .string()
    .min(32, 'CHECKERS_BOT_SHARED_SECRET must be at least 32 chars'),

  // Optional: per-user bot cooldown in seconds. Backend has its own cooldown.
  BOT_COMMAND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(5),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type BotEnv = z.infer<typeof EnvSchema>;

let cached: BotEnv | null = null;

export function getEnv(): BotEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid bot environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the cache. ONLY for tests. */
export function _resetEnvForTests(): void {
  cached = null;
}
