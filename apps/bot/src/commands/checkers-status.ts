/**
 * /checkers-status — show the user's per-path progress.
 *
 * Read-only. Does not create a user or trigger any side effects.
 * Phase 4.6.4.1: shows both Sheriff's Trial and Unbaked Duel separately;
 * wins do not combine across paths.
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { getUserMarks } from '../backend-client.js';
import { errorEmbed, marksStatusEmbed } from '../lib/embeds.js';
import { describeBackendError } from '../lib/errors.js';

export const checkersStatusCommandData = new SlashCommandBuilder()
  .setName('checkers-status')
  .setDescription('Check your progress on both opponent paths (Sheriff & Unbaked).');

export async function handleCheckersStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await getUserMarks(interaction.user.id);
    // Phase 4.6.4.1: `paths` is now a REQUIRED field of the response.
    // No fallback to combined-total view — the embed insists on it.
    await interaction.editReply({
      embeds: [marksStatusEmbed({ paths: result.paths })],
    });
  } catch (err) {
    const friendly = describeBackendError(err);
    await interaction.editReply({
      embeds: [errorEmbed(friendly)],
    });
  }
}
