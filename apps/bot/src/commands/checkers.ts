/**
 * /checkers — start (or resume) a duel.
 *
 * Flow (Phase 5.0.14):
 *   1. Defer ephemeral reply
 *   2. Bot-side cooldown check
 *   3. POST /api/checkers/session/start-or-resume
 *   4a. kind === 'new'      → render new-session embed + Resume link button
 *   4b. kind === 'resumed'  → render resumed-session embed + Resume link
 *                              button + Forfeit & Start New button
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { cancelActiveSession, startOrResumeSession } from '../backend-client.js';
import {
  cooldownEmbed,
  errorEmbed,
  sessionResumedEmbed,
  sessionStartedEmbed,
} from '../lib/embeds.js';
import { describeBackendError } from '../lib/errors.js';
import { getUserMarks } from '../backend-client.js';
import type { CooldownTracker } from '../lib/cooldown.js';

export const checkersCommandData = new SlashCommandBuilder()
  .setName('checkers')
  .setDescription('Duel opponents and earn marks toward clearing the level.');

/**
 * Phase 5.0.14: namespace for /checkers button customIds.
 * The dispatcher uses this to recognize our buttons vs other features'.
 */
export const CHECKERS_BUTTON_PREFIX = 'checkers';

const ZERO_PATHS = {
  sheriff: { marks: 0, required: 4, passed: false },
  unbaked: { marks: 0, required: 2, passed: false },
};

async function fetchPaths(discordId: string): Promise<typeof ZERO_PATHS> {
  try {
    const result = await getUserMarks(discordId);
    return result.paths;
  } catch {
    // Silent — fall back to zero paths so we don't fail the whole command.
    return ZERO_PATHS;
  }
}

/**
 * Builds the response components for a start-or-resume result. Used by
 * both the /checkers command path and the Forfeit & Start New button path
 * (the latter always produces a 'new' kind, but routing through the same
 * builder keeps the output consistent).
 */
function buildResponseFor(args: {
  kind: 'new' | 'resumed';
  gameUrl: string;
  expiresAt: string;
  paths: typeof ZERO_PATHS;
  resumed:
    | {
        status: 'pending' | 'active';
        opponentType: string;
        moveCount: number;
      }
    | null;
}) {
  const linkButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(args.kind === 'resumed' ? 'Resume Game ↗' : 'Open the board ↗')
    .setURL(args.gameUrl);

  if (args.kind === 'resumed' && args.resumed) {
    const forfeitButton = new ButtonBuilder()
      .setCustomId(`${CHECKERS_BUTTON_PREFIX}:forfeit_start_new`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('Forfeit & Start New');

    const embed = sessionResumedEmbed({
      paths: args.paths,
      expiresAt: args.expiresAt,
      resumed: args.resumed,
    });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      linkButton,
      forfeitButton,
    );
    return { embed, row };
  }

  const embed = sessionStartedEmbed({
    paths: args.paths,
    expiresAt: args.expiresAt,
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);
  return { embed, row };
}

export function makeCheckersHandler(cooldown: CooldownTracker) {
  return async function handleCheckers(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const cd = cooldown.check(interaction.user.id);
    if (!cd.ok) {
      await interaction.reply({
        embeds: [cooldownEmbed({ retryAfterSeconds: cd.retryAfterSeconds })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await startOrResumeSession({
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
      });

      const paths = await fetchPaths(interaction.user.id);

      const { embed, row } = buildResponseFor({
        kind: result.kind,
        gameUrl: result.gameUrl,
        expiresAt: result.expiresAt,
        paths,
        resumed: result.resumed ?? null,
      });

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

/**
 * Phase 5.0.14: handler for the Forfeit & Start New button on the
 * resumed-session embed. Cancels the player's unfinished session, then
 * starts a brand-new one and replaces the original embed with the new
 * session's launch UI.
 */
export async function handleForfeitAndStartNew(
  interaction: ButtonInteraction,
  cooldown: CooldownTracker,
): Promise<void> {
  // Cooldown check (separate budget from /checkers but uses the same tracker).
  const cd = cooldown.check(interaction.user.id);
  if (!cd.ok) {
    await interaction.reply({
      embeds: [cooldownEmbed({ retryAfterSeconds: cd.retryAfterSeconds })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  try {
    // 1. Cancel any unfinished sessions for this user.
    await cancelActiveSession(interaction.user.id);

    // 2. Start a fresh session. start-or-resume will see no unfinished
    //    session (we just cancelled them all) and create a new one.
    const result = await startOrResumeSession({
      discordId: interaction.user.id,
      discordUsername: interaction.user.username,
    });

    const paths = await fetchPaths(interaction.user.id);

    const { embed, row } = buildResponseFor({
      kind: result.kind, // expected 'new'
      gameUrl: result.gameUrl,
      expiresAt: result.expiresAt,
      paths,
      resumed: result.resumed ?? null,
    });

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    const friendly = describeBackendError(err);
    await interaction.editReply({
      embeds: [errorEmbed(friendly)],
      components: [],
    });
  }
}
