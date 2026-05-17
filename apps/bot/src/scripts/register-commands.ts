/**
 * Register slash commands with Discord (one-time / on-change).
 *
 * Usage:
 *   npm run register-commands
 *
 * Run this:
 *   - Once after first setup
 *   - Whenever you add, rename, or change a command
 *
 * Per-guild registration is used (DISCORD_GUILD_ID) so updates appear in
 * Discord instantly. Global commands take up to an hour to propagate.
 *
 * To promote to global commands later, change `Routes.applicationGuildCommands`
 * to `Routes.applicationCommands` below.
 */

import { REST, Routes } from 'discord.js';

import { commandPayloads } from '../commands/index.js';
import { getEnv } from '../env.js';

async function main(): Promise<void> {
  const env = getEnv();
  const payloads = commandPayloads();

  // eslint-disable-next-line no-console
  console.log(
    `[register] pushing ${payloads.length} command(s) to guild ${env.DISCORD_GUILD_ID}…`,
  );

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);

  const result = await rest.put(
    Routes.applicationGuildCommands(
      env.DISCORD_APPLICATION_ID,
      env.DISCORD_GUILD_ID,
    ),
    { body: payloads },
  );

  const registered = Array.isArray(result) ? result.length : 0;
  // eslint-disable-next-line no-console
  console.log(`[register] ok — ${registered} command(s) registered.`);
  for (const p of payloads) {
    // eslint-disable-next-line no-console
    console.log(`           /${p.name} — ${p.description}`);
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[register] failed:', err);
  process.exit(1);
});
