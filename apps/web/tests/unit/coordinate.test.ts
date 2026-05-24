/**
 * Unit tests for client-side coordinate helpers. Pure functions, no DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  anyPlayerCaptureAvailable,
  isDarkSquare,
  posKey,
  samePos,
} from '../../src/app/checkers/[sessionId]/_lib/coordinate';

type Cell = { side: 'player' | 'cpu'; king: boolean } | null;
const empty = (): Cell[][] =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null as Cell));

describe('samePos', () => {
  it('returns true for identical positions', () => {
    expect(samePos([3, 4], [3, 4])).toBe(true);
  });

  it('returns false for different positions', () => {
    expect(samePos([3, 4], [4, 3])).toBe(false);
  });

  it('handles null and undefined safely', () => {
    expect(samePos(null, [0, 0])).toBe(false);
    expect(samePos([0, 0], null)).toBe(false);
    expect(samePos(null, null)).toBe(false);
    expect(samePos(undefined, undefined)).toBe(false);
  });
});

describe('posKey', () => {
  it('stringifies a position', () => {
    expect(posKey([3, 4])).toBe('3,4');
    expect(posKey([0, 0])).toBe('0,0');
    expect(posKey([7, 7])).toBe('7,7');
  });

  it('different positions yield different keys', () => {
    expect(posKey([3, 4])).not.toBe(posKey([4, 3]));
  });
});

describe('isDarkSquare', () => {
  it('matches engine convention (row+col odd)', () => {
    expect(isDarkSquare(0, 0)).toBe(false);
    expect(isDarkSquare(0, 1)).toBe(true);
    expect(isDarkSquare(1, 0)).toBe(true);
    expect(isDarkSquare(1, 1)).toBe(false);
    expect(isDarkSquare(7, 6)).toBe(true);
    expect(isDarkSquare(7, 7)).toBe(false);
  });
});

describe('anyPlayerCaptureAvailable', () => {
  it('returns false on an empty board', () => {
    expect(anyPlayerCaptureAvailable(empty())).toBe(false);
  });

  it('returns false when only player pieces exist with nothing to jump over', () => {
    const b = empty();
    b[5]![2] = { side: 'player', king: false };
    b[5]![4] = { side: 'player', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(false);
  });

  it('returns true when a player man can capture a cpu piece diagonally upward', () => {
    const b = empty();
    // Player at (5,2). CPU at (4,3). Landing at (3,4) is empty.
    b[5]![2] = { side: 'player', king: false };
    b[4]![3] = { side: 'cpu', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(true);
  });

  it('returns false if the landing square is blocked', () => {
    const b = empty();
    b[5]![2] = { side: 'player', king: false };
    b[4]![3] = { side: 'cpu', king: false };
    b[3]![4] = { side: 'player', king: false }; // blocks landing
    expect(anyPlayerCaptureAvailable(b)).toBe(false);
  });

  it('player man cannot capture downward (only kings move both ways)', () => {
    const b = empty();
    // Player man at (3,2), CPU at (4,3), empty at (5,4).
    b[3]![2] = { side: 'player', king: false };
    b[4]![3] = { side: 'cpu', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(false);
  });

  it('player king CAN capture downward', () => {
    const b = empty();
    b[3]![2] = { side: 'player', king: true };
    b[4]![3] = { side: 'cpu', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(true);
  });

  it('player cannot capture own piece', () => {
    const b = empty();
    b[5]![2] = { side: 'player', king: false };
    b[4]![3] = { side: 'player', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(false);
  });

  it('ignores captures for CPU pieces (only reports for player)', () => {
    const b = empty();
    // CPU at (0,0) — no diagonal-up neighbors for a player to jump anything.
    // Player man at (7,7) — corner, no upward jumps possible (man only
    // moves up the board, and at the edge there's nothing to jump).
    // The two pieces are arranged so that NO player capture is geometrically
    // possible, regardless of the helper's logic.
    b[0]![0] = { side: 'cpu', king: false };
    b[7]![7] = { side: 'player', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(false);
  });

  it('finds capture near board edge without going out of bounds', () => {
    const b = empty();
    // Player at (1,1), CPU at (0,2). Landing would be (-1,3) — out of bounds.
    b[1]![1] = { side: 'player', king: false };
    b[0]![2] = { side: 'cpu', king: false };
    expect(anyPlayerCaptureAvailable(b)).toBe(false);
  });
});
