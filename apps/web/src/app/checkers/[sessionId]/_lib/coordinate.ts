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
