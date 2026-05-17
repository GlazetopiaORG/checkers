/**
 * /checkers-status — show the user's current mark count.
 *
 * Read-only. Does not create a user or trigger any side effects.
 * If the user has never played, returns 0 / required.
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
  .setDescription('Check how many marks you have against the Unbaked.');

export async function handleCheckersStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await getUserMarks(interaction.user.id);
    await interaction.editReply({
      embeds: [marksStatusEmbed({ marks: result.marks, required: result.required })],
    });
  } catch (err) {
    const friendly = describeBackendError(err);
    await interaction.editReply({
      embeds: [errorEmbed(friendly)],
    });
  }
}
