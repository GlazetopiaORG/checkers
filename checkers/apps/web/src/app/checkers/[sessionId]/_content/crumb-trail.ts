/**
 * ============================================================================
 *  THE CRUMB TRAIL — editable content
 * ============================================================================
 *
 *  Welcome! This file controls EVERY text string shown in the "Crumb Trail"
 *  side panel on the checkers game page.
 *
 *  WHO THIS FILE IS FOR
 *  --------------------
 *  You. The non-coder editing copy. You should not need to touch any
 *  React component to change the panel's text. Just edit strings here,
 *  save the file, and refresh the game in your browser.
 *
 *  HOW TO EDIT
 *  -----------
 *  Every editable section below starts with a clearly marked comment:
 *
 *      // ┌─── EDIT HERE: <what this section does> ─────────────────────────
 *
 *  Look for that pattern, change the strings inside the quotes, save.
 *  TypeScript will flag anything broken in your editor before you save.
 *
 *  SAFETY RULES — PLEASE READ
 *  --------------------------
 *  This file ships to the player's browser. Anything in it is PUBLIC.
 *  A unit test will fail the build if any crumb or tip contains:
 *    - the word "answer"
 *    - the word "password"
 *    - the word "PIN"  (case insensitive)
 *    - the substring "code:" or "color:"
 *    - any 6+ character ALL CAPS run that looks like an unlock string
 *      (e.g. "SUGAR42" — but ordinary words like "GUARDIAN" or
 *      "UNBAKED" are fine because they're known lore terms; see
 *      the LORE_TERMS allowlist below)
 *
 *  DO NOT put real puzzle answers, unlock codes, color reveals, or
 *  anything wallet/token related here. Atmospheric lore is fine.
 *  Real gated clues will come from the backend in a later phase.
 *
 *  WHERE THIS APPEARS
 *  ------------------
 *  Desktop: a column on the right of the checkers board, after the
 *  comic cover flips open.
 *  Mobile:  a stacked section below the board.
 * ============================================================================
 */

import type { ThemeKey } from '../_lib/themes';

// ┌─── EDIT HERE: panel header ──────────────────────────────────────────────
//
// These two strings appear at the very top of the panel.
//   - panelTitle    : the big header
//   - panelSubtitle : the smaller line underneath
//
// Keep them short — they appear in a narrow column on desktop.
// ───────────────────────────────────────────────────────────────────────────
const HEADER = {
  panelTitle: 'The Crumb Trail',
  panelSubtitle: 'Whispers from the bakery edge',
} as const;

// ┌─── EDIT HERE: section headings ──────────────────────────────────────────
//
// The panel has four sections. These are their headings.
// Rename freely — they're just labels.
// ───────────────────────────────────────────────────────────────────────────
const SECTIONS = {
  path: 'Path',
  themeLore: 'Theme Lore',
  duelStatus: 'Duel Status',
  loreCrumb: 'A Crumb on the Wind',
} as const;

// ┌─── EDIT HERE: duel-status row labels ────────────────────────────────────
//
// Each row in the "Duel Status" section uses a label from here.
// If a value isn't available (e.g. move count is zero), the row hides
// itself instead of changing the label.
// ───────────────────────────────────────────────────────────────────────────
const DUEL_LABELS = {
  turn: 'Turn',
  marks: 'Marks',
  capturesAvailable: 'Captures available',
  moveCount: 'Moves played',
  yourTurn: 'Yours',
  // The opponent-specific "their turn" labels. Phase 4.6.4 added the
  // Sheriff path — the panel picks one based on the session's opponentType.
  unbakedTurn: 'The Unbaked',
  sheriffTurn: 'Sheriff Buttercream',
  gameOver: 'Concluded',
  // Shown in the "captures available" row when applicable. It's intentionally
  // vague — surfaces the rule, not the answer.
  capturesValue: 'A forced jump waits',
} as const;

// ┌─── EDIT HERE: per-opponent atmospheric lore lines (Phase 4.6.4) ─────────
//
// Shown in the "Path" section under the path name. Pure flavor — no real
// puzzle answers, codes, colors, or hidden mechanics belong here.
// ───────────────────────────────────────────────────────────────────────────
const OPPONENT_LORE = {
  sheriff:
    "The Sheriff watches every move. He's not here to break you — he's here to see whether you'll break yourselves.",
  unbaked:
    "The Unbaked moves in patterns that taste wrong. Every line is a trap dressed as kindness.",
} as const;

// ┌─── EDIT HERE: per-theme atmospheric lore lines ──────────────────────────
//
// One line per board theme, shown in the "Theme Lore" section under
// the theme name.
//
// This is DIFFERENT from the `flavor` text on the comic cover. The cover's
// flavor is a one-liner shown before play starts. This is a longer, slower
// atmospheric line shown during play.
//
// Keep them 1-2 sentences. They should feel like the narrator setting
// the scene, not telling the player anything they need to do.
// ───────────────────────────────────────────────────────────────────────────
const THEME_LORE: Record<ThemeKey, string> = {
  'bakery':
    'The ovens are quiet tonight. Too quiet. Even the sugar grinders have hushed their tune.',
  'glaze-gulch':
    'Out past the donut buttes, the dusk turns the sand to caramel. A long shadow follows every horseback rider home.',
  'frosting':
    'The streamers are still up from the festival. So is the dread. Something is loose between the pastry stalls.',
  'unbaked':
    'You can taste the wrongness in the air — flour gone sour, glaze gone slow. The Unbaked watches with eyes that are not eyes.',
  'comic':
    'The page snaps tight at every move. POW! BAM! — somewhere a narrator is having the time of their life.',
};

// ┌─── EDIT HERE: mystery breadcrumb lines ──────────────────────────────────
//
// These are the heart of the panel. One is picked per session and shown
// in the "Crumb" section. The same session always shows the same crumb
// so the player can take a screenshot, share it, theorize.
//
// HOW TO ADD MORE: just add a new line to the array. Keep them:
//   - SHORT (one sentence)
//   - ATMOSPHERIC (feels like a clue without being one)
//   - SAFE (no real answers, codes, colors, wallet stuff)
//
// HOW TO REMOVE: delete the line. The system handles any count >= 1.
// ───────────────────────────────────────────────────────────────────────────
const CRUMBS: readonly string[] = [
  'Not every sprinkle shines by accident.',
  'The Unbaked leave crumbs where they should leave shadows.',
  'Uncle Long John says a quiet board can still hide a trap.',
  'Some clues are baked into the edges.',
  'GUARDIAN was not written for decoration.',
  'Buttercream still dreams of the old recipe. He just can\'t read it anymore.',
  'Count the kings. Then count again, slower.',
  'Crumbs travel further when the wind comes from the gulch.',
  'A locked door is just a door that hasn\'t been asked nicely.',
  'D\'Lish doesn\'t carry that sword for show.',
];

// ┌─── EDIT HERE: rotating checkers tips ────────────────────────────────────
//
// Same rotation logic as crumbs — one tip per session, deterministic.
// These are gameplay-flavored rather than lore-flavored. Useful for
// newer players without breaking immersion.
// ───────────────────────────────────────────────────────────────────────────
const TIPS: readonly string[] = [
  'Forced captures are not optional. Take them.',
  'Kings cross more ground than men. Make every promotion count.',
  'A draw earns no mark. Play to win.',
  'A trade is good when you trade up. A trade is bad when you trade down.',
  'Edges are easier to defend than centers.',
] as const;

// ============================================================================
//  Exported content object — DO NOT EDIT BELOW THIS LINE
//  (Just edit the constants above.)
// ============================================================================

export interface CrumbTrailContent {
  header: typeof HEADER;
  sections: typeof SECTIONS;
  duelLabels: typeof DUEL_LABELS;
  themeLore: Record<ThemeKey, string>;
  /** Phase 4.6.4: per-opponent lore strings, shown in the Path section. */
  opponentLore: typeof OPPONENT_LORE;
  crumbs: readonly string[];
  tips: readonly string[];
}

export const CRUMB_TRAIL_CONTENT: CrumbTrailContent = {
  header: HEADER,
  sections: SECTIONS,
  duelLabels: DUEL_LABELS,
  themeLore: THEME_LORE,
  opponentLore: OPPONENT_LORE,
  crumbs: CRUMBS,
  tips: TIPS,
};

/**
 * Known lore terms allowed to appear in ALL CAPS without tripping the
 * safety scanner. If you introduce a new lore term that's all-caps,
 * add it here.
 */
export const LORE_TERMS_ALLOWLIST: readonly string[] = [
  'GUARDIAN',
  'UNBAKED',
  'GLAZETOPIA',
  'GULCH',
  'POW',
  'BAM',
] as const;

/**
 * Deterministic picker — same input always returns the same index.
 * Used so a given session shows the same crumb/tip across re-renders
 * and refreshes (no flicker, no random reroll mid-game).
 */
function pickIndex(seed: string, length: number): number {
  if (length === 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

/**
 * Returns one crumb for the given session id. If the crumb list is empty,
 * returns an empty string (the panel will hide the section).
 */
export function pickCrumbForSession(sessionId: string): string {
  if (CRUMBS.length === 0) return '';
  return CRUMBS[pickIndex(`${sessionId}::crumb`, CRUMBS.length)]!;
}

/**
 * Returns one tip for the given session id. If the tips list is empty,
 * returns an empty string (the panel will hide the section).
 */
export function pickTipForSession(sessionId: string): string {
  if (TIPS.length === 0) return '';
  return TIPS[pickIndex(`${sessionId}::tip`, TIPS.length)]!;
}
