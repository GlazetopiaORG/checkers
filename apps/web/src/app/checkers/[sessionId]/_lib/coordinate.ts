/**
 * Pure coordinate helpers used by the UI. No React, no DOM.
 */

import type { Position } from '@glazetopia/engine';

/** Equality for two positions. */
export function samePos(
  a: Position | null | undefined,
  b: Position | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}

/** Stringify for use as a Map/Set key. */
export function posKey(pos: Position): string {
  return `${pos[0]},${pos[1]}`;
}

/** True if (row + col) is odd — the dark playable squares. */
export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

/**
 * Returns true if any player piece on the board has at least one legal
 * capture available.
 *
 * Used by the Crumb Trail panel to surface the "captures are forced" rule
 * as a UI hint. The backend is still authoritative for which moves are
 * actually legal — this is a quick, conservative check used only for
 * rendering. It deliberately does NOT chase multi-jumps; one-step is
 * enough to know "a capture exists somewhere."
 *
 * Plain coordinate inspection on an 8x8 grid — no engine import needed.
 * Cell shape ({ side, king }) matches the engine's Piece type.
 */
type Cell = { side: 'player' | 'cpu'; king: boolean } | null;
type BoardLike = readonly (readonly Cell[])[];

export function anyPlayerCaptureAvailable(board: BoardLike): boolean {
  for (let r = 0; r < 8; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const piece = row[c];
      if (!piece || piece.side !== 'player') continue;

      // Player men move up the board (toward row 0). Kings move both ways.
      // For captures, the diagonal direction is the same as movement.
      const dirs: Array<[number, number]> = piece.king
        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        : [[-1, -1], [-1, 1]];

      for (const [dr, dc] of dirs) {
        const midR = r + dr;
        const midC = c + dc;
        const landR = r + 2 * dr;
        const landC = c + 2 * dc;
        if (landR < 0 || landR > 7 || landC < 0 || landC > 7) continue;
        const mid = board[midR]?.[midC];
        const land = board[landR]?.[landC];
        if (mid && mid.side === 'cpu' && land === null) {
          return true;
        }
      }
    }
  }
  return false;
}
