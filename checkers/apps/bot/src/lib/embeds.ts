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
/**
 * Session-started embed shown when /checkers launches a new duel.
 *
 * Phase 4.6.4.1: shows per-path progress (Sheriff and Unbaked) instead of
 * a combined "marks" total. Wins on one path do NOT count toward passing
 * the other; the embed makes that explicit.
 */
export function sessionStartedEmbed(opts: {
  paths: {
    sheriff: { marks: number; required: number; passed: boolean };
    unbaked: { marks: number; required: number; passed: boolean };
  };
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
        name: "Sheriff's Trial",
        value: pathLine(
          opts.paths.sheriff.marks,
          opts.paths.sheriff.required,
          opts.paths.sheriff.passed,
        ),
        inline: true,
      },
      {
        name: 'Unbaked Duel',
        value: pathLine(
          opts.paths.unbaked.marks,
          opts.paths.unbaked.required,
          opts.paths.unbaked.passed,
        ),
        inline: true,
      },
      {
        name: 'Expires',
        value: `<t:${unixSeconds(opts.expiresAt)}:R>`,
        inline: false,
      },
    )
    .setFooter({ text: 'Each path is independent — wins do not combine.' });
}

/**
 * /checkers-status embed — per-opponent path breakdown.
 *
 * Phase 4.6.4.1: the legacy single-count fallback was REMOVED. The embed
 * now ONLY shows per-path progress, and `paths` is required. This is to
 * prevent the misleading impression that wins on different paths combine
 * toward a single passing threshold.
 *
 * Wins on the Sheriff path NEVER count toward the Unbaked threshold and
 * vice versa. The "Level Passed" line is sheriffPassed || unbakedPassed.
 */
export function marksStatusEmbed(opts: {
  paths: {
    sheriff: { marks: number; required: number; passed: boolean };
    unbaked: { marks: number; required: number; passed: boolean };
  };
}): EmbedBuilder {
  const sheriffPassed = opts.paths.sheriff.passed;
  const unbakedPassed = opts.paths.unbaked.passed;
  const anyPassed = sheriffPassed || unbakedPassed;

  const builder = new EmbedBuilder()
    .setColor(anyPassed ? COLOR_SUCCESS : COLOR_ACCENT)
    .setTitle('Your standing in Glazetopia Checkers')
    .addFields(
      {
        name: "Sheriff's Trial",
        value: pathLine(
          opts.paths.sheriff.marks,
          opts.paths.sheriff.required,
          opts.paths.sheriff.passed,
        ),
        inline: true,
      },
      {
        name: 'Unbaked Duel',
        value: pathLine(
          opts.paths.unbaked.marks,
          opts.paths.unbaked.required,
          opts.paths.unbaked.passed,
        ),
        inline: true,
      },
      {
        name: 'Level Passed',
        value: levelPassedSummary(sheriffPassed, unbakedPassed),
        inline: false,
      },
    )
    .setFooter({ text: 'Each path is independent — wins do not combine.' });

  // Narrative description tailored to the player's current state.
  if (sheriffPassed && unbakedPassed) {
    builder.setDescription(
      'Both paths cleared. The Sheriff salutes; the Unbaked stays quiet.',
    );
  } else if (sheriffPassed) {
    builder.setDescription(
      "The Sheriff's badge is yours. The Unbaked still waits in the shadows.",
    );
  } else if (unbakedPassed) {
    builder.setDescription(
      "You've broken the Unbaked. The Sheriff's trial remains.",
    );
  } else if (opts.paths.sheriff.marks === 0 && opts.paths.unbaked.marks === 0) {
    builder.setDescription(
      'No duels yet. Run `/checkers` to choose your path.',
    );
  } else {
    const sheriffLeft = Math.max(
      0,
      opts.paths.sheriff.required - opts.paths.sheriff.marks,
    );
    const unbakedLeft = Math.max(
      0,
      opts.paths.unbaked.required - opts.paths.unbaked.marks,
    );
    builder.setDescription(
      `Sheriff: ${sheriffLeft} to go. Unbaked: ${unbakedLeft} to go.`,
    );
  }

  return builder;
}

function pathLine(marks: number, required: number, passed: boolean): string {
  const filled = '🟡'.repeat(Math.min(marks, required));
  const empty = '⚫'.repeat(Math.max(0, required - marks));
  const checkmark = passed ? '  ✅' : '';
  return `${filled}${empty}  **${marks} / ${required} wins**${checkmark}`;
}

function levelPassedSummary(sheriffPassed: boolean, unbakedPassed: boolean): string {
  if (sheriffPassed && unbakedPassed) return 'Yes — both paths';
  if (sheriffPassed) return "Yes — Sheriff's Trial";
  if (unbakedPassed) return 'Yes — Unbaked Duel';
  return 'No';
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

function unixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}
