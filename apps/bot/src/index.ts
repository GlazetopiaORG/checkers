/**
 * Glazetopia Checkers bot — entry point.
 *
 * Connects to Discord via the gateway (WebSocket) and listens for
 * slash command interactions. Forwards each to the dispatcher.
 *
 * Phase 5: also runs a tiny internal HTTP server (see http-server.ts)
 * for inbound role-grant requests from the web backend.
 *
 * The bot:
 *   - Does NOT touch the database directly
 *   - Does NOT hold the JWT secret
 *   - DOES assign Discord roles, but only on validated HMAC requests
 *     from the web backend (Phase 5)
 *   - Only talks to the checkers backend over HMAC-signed HTTPS
 */

import { Client, Events, GatewayIntentBits } from 'discord.js';

import { makeDispatcher } from './commands/index.js';
import { getEnv } from './env.js';
import { startBotHttpServer } from './http-server.js';
import { verifyRolePermissions } from './permissions-check.js';

async function main(): Promise<void> {
  const env = getEnv();

  // We only need the Guilds intent for slash commands. No Message Content,
  // no Members — keep permissions minimal so Discord approval is easy.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const dispatch = makeDispatcher();

  client.once(Events.ClientReady, async (c) => {
    // eslint-disable-next-line no-console
    console.log(`[bot] logged in as ${c.user.tag} (id=${c.user.id})`);

    // Phase 5: verify role-grant permissions on startup. The check logs
    // any misconfiguration clearly; we don't crash on failure so the bot
    // still serves gameplay commands even if role grants are broken.
    try {
      await verifyRolePermissions(client);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[phase5-bot] unexpected error during permissions check: ${
          err instanceof Error ? err.stack : String(err)
        }`,
      );
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await dispatch(interaction);
    } catch (err) {
      // Last-resort error handler — individual commands should catch their own
      // errors, but if something escapes, log it and tell the user.
      // eslint-disable-next-line no-console
      console.error('[bot] uncaught command error:', err);
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: 'Something went wrong handling this command. Please try again.',
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: 'Something went wrong handling this command. Please try again.',
            ephemeral: true,
          });
        }
      } catch {
        // Swallow — we already logged the real error.
      }
    }
  });

  client.on(Events.Error, (err) => {
    // eslint-disable-next-line no-console
    console.error('[bot] gateway error:', err);
  });

  client.on(Events.Warn, (msg) => {
    // eslint-disable-next-line no-console
    console.warn('[bot] gateway warn:', msg);
  });

  // Login. discord.js handles reconnection internally.
  await client.login(env.DISCORD_BOT_TOKEN);

  // Phase 5: start the inbound HTTP server. We do this AFTER login so the
  // client is ready to handle Discord calls; the server runs alongside the
  // gateway connection for the lifetime of the process.
  await startBotHttpServer(client);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[bot] fatal startup error:', err);
  process.exit(1);
});
