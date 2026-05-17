/**
 * Embed builders for bot replies.
 *
 * Centralized here so the lore/copy is consistent and the visual style is
 * easy to refine without hunting through command handlers.
 *
 * Colors are chosen to match the game UI palette (defined in apps/web's
 * checkers.css):
 *   - accent yellow #ffd84a — sessions, info
 *   - success green #5fe46a — passed level
 *   - danger red   #ff5a5a — errors, cooldowns
 *   - dim          #5b3a1a — neutral
 */

import { EmbedBuilder } from 'discord.js';

const COLOR_ACCENT  = 0xffd84a;
const COLOR_SUCCESS = 0x5fe46a;
const COLOR_DANGER  = 0xff5a5a;
const COLOR_NEUTRAL = 0x5b3a1a;

/**
 * "Your duel is ready" — posted after /checkers succeeds.
 * The launch URL is rendered as a link button by the command handler;
 * this embed sits alongside it.
 */
export function sessionStartedEmbed(opts: {
  marks: number;
  required: number;
  expiresAt: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_ACCENT)
    .setTitle('🍩 The Unbaked stirs at the edge of town…')
    .setDescription(
      'A duel awaits. Tap the button below to open the board.\n' +
        '*This link is private to you and expires in a few minutes.*',
    )
    .addFields(
      {
        name: 'Marks',
        value: marksLine(opts.marks, opts.required),
        inline: true,
      },
      {
        name: 'Expires',
        value: `<t:${unixSeconds(opts.expiresAt)}:R>`,
        inline: true,
      },
    );
}

/**
 * "/checkers-status" — posted in response to the status command.
 */
export function marksStatusEmbed(opts: {
  marks: number;
  required: number;
}): EmbedBuilder {
  const passed = opts.marks >= opts.required;
  const builder = new EmbedBuilder()
    .setColor(passed ? COLOR_SUCCESS : COLOR_ACCENT)
    .setTitle('Your standing against the Unbaked')
    .addFields({
      name: 'Marks',
      value: marksLine(opts.marks, opts.required),
      inline: false,
    });

  if (passed) {
    builder.setDescription(
      "You've cleared this hollow of the Unbaked. The level is yours.",
    );
  } else if (opts.marks === 0) {
    builder.setDescription(
      'No duels yet. Run `/checkers` to face the Unbaked for the first time.',
    );
  } else {
    const left = opts.required - opts.marks;
    builder.setDescription(
      `${left} more ${left === 1 ? 'duel' : 'duels'} stands between you and the level pass.`,
    );
  }

  return builder;
}

/**
 * Rate-limit / cooldown reply.
 */
export function cooldownEmbed(opts: { retryAfterSeconds: number }): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_DANGER)
    .setTitle('Catch your breath')
    .setDescription(
      `The Sheriff's deputies are still checking your papers. Try again in **${opts.retryAfterSeconds}s**.`,
    );
}

/**
 * Generic error reply.
 */
export function errorEmbed(opts: { title?: string; message: string }): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_DANGER)
    .setTitle(opts.title ?? 'Something went wrong')
    .setDescription(opts.message);
}

/**
 * Neutral info reply.
 */
export function infoEmbed(opts: { title: string; message: string }): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_NEUTRAL)
    .setTitle(opts.title)
    .setDescription(opts.message);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function marksLine(marks: number, required: number): string {
  // Filled dots for earned marks, hollow for remaining.
  const filled = '🟡'.repeat(Math.min(marks, required));
  const empty = '⚫'.repeat(Math.max(0, required - marks));
  return `${filled}${empty}  **${marks} / ${required}**`;
}

function unixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}
