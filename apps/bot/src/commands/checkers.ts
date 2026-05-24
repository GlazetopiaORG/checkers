/**
 * /checkers — start a duel against the Unbaked.
 *
 * Flow:
 *   1. Defer ephemeral reply (gives us up to 15 min before we must respond)
 *   2. Bot-side cooldown check
 *   3. POST /api/checkers/session/start
 *   4. Reply with embed + launch button
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { startSession } from '../backend-client';
import {
  cooldownEmbed,
  errorEmbed,
  sessionStartedEmbed,
} from '../lib/embeds';
import { describeBackendError } from '../lib/errors';
import { getUserMarks } from '../backend-client';
import type { CooldownTracker } from '../lib/cooldown';

export const checkersCommandData = new SlashCommandBuilder()
  .setName('checkers')
  .setDescription("Duel the Unbaked. Three wins clears the level.");

export function makeCheckersHandler(cooldown: CooldownTracker) {
  return async function handleCheckers(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    // 1. Cooldown check happens BEFORE deferReply so we can answer immediately.
    const cd = cooldown.check(interaction.user.id);
    if (!cd.ok) {
      await interaction.reply({
        embeds: [cooldownEmbed({ retryAfterSeconds: cd.retryAfterSeconds })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 2. Defer ephemeral. From here on we MUST call editReply, not reply.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // 3. Start the session via the backend.
      const session = await startSession({
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
      });

      // 4. Fetch per-opponent marks for the embed. Best-effort — if the
      //    backend fails we still want to show the session link, so we
      //    fall back to all-zero paths.
      const ZERO_PATHS = {
        sheriff: { marks: 0, required: 5, passed: false },
        unbaked: { marks: 0, required: 3, passed: false },
      };
      let paths = ZERO_PATHS;
      try {
        const result = await getUserMarks(interaction.user.id);
        paths = result.paths;
      } catch {
        // Silent — embed shows the zero-paths fallback. Better than failing
        // the entire /checkers command for a status read.
      }

      // 5. Build reply: embed + link button.
      const embed = sessionStartedEmbed({
        paths,
        expiresAt: session.expiresAt,
      });

      const launchButton = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Open the board ↗')
        .setURL(session.gameUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(launchButton);

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (err) {
      const friendly = describeBackendError(err);
      await interaction.editReply({
        embeds: [errorEmbed(friendly)],
      });
    }
  };
}
