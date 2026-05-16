import { describe, expect, it } from 'vitest';

import { initialState } from '../src/board.js';
import { makeConfig } from '../src/config.js';
import { applyMove, legalMoves, movesEqual } from '../src/moves.js';
import type { Move } from '../src/types.js';
import { makeState, pos } from './_helpers.js';

describe('legalMoves — opening position', () => {
  it('player has 7 legal opening slides', () => {
    // From row 5: pieces at (5,0), (5,2), (5,4), (5,6).
    // Each can move forward-diagonally; corners have 1 option, others have 2.
    // (5,0): only (4,1)            -> 1
    // (5,2): (4,1) and (4,3)       -> 2
    // (5,4): (4,3) and (4,5)       -> 2
    // (5,6): (4,5) and (4,7)       -> 2
    // Total: 7
    const moves = legalMoves(initialState());
    expect(moves).toHaveLength(7);
    for (const m of moves) {
      expect(m.captures).toHaveLength(0);
      expect(m.from[0]).toBe(5);
    }
  });
});

describe('legalMoves — direction restrictions', () => {
  it('player men can only move toward row 0', () => {
    const state = makeState([{ row: 4, col: 3, side: 'player' }], 'player');
    const moves = legalMoves(state);
    // Should target row 3 only, not row 5.
    expect(moves.every((m) => m.to[0] === 3)).toBe(true);
  });

  it('cpu men can only move toward row 7', () => {
    const state = makeState([{ row: 3, col: 4, side: 'cpu' }], 'cpu');
    const moves = legalMoves(state);
    expect(moves.every((m) => m.to[0] === 4)).toBe(true);
  });

  it('kings can move both directions by default', () => {
    const state = makeState(
      [{ row: 4, col: 3, side: 'player', king: true }],
      'player',
    );
    const moves = legalMoves(state);
    const rows = new Set(moves.map((m) => m.to[0]));
    expect(rows.has(3)).toBe(true);
    expect(rows.has(5)).toBe(true);
  });
});

describe('legalMoves — blocked squares', () => {
  it('cannot move onto a friendly piece', () => {
    const state = makeState(
      [
        { row: 5, col: 2, side: 'player' },
        { row: 4, col: 1, side: 'player' },
        { row: 4, col: 3, side: 'player' },
      ],
      'player',
    );
    const movesFrom52 = legalMoves(state, undefined, pos(5, 2));
    expect(movesFrom52).toHaveLength(0);
  });

  it('returns empty list when game is not active', () => {
    const state = makeState(
      [{ row: 5, col: 2, side: 'player' }],
      'player',
      { status: 'won' },
    );
    expect(legalMoves(state)).toEqual([]);
  });
});

describe('legalMoves — restrict by from-square', () => {
  it('only returns moves from the given square', () => {
    const all = legalMoves(initialState());
    const fromOne = legalMoves(initialState(), undefined, pos(5, 2));
    expect(fromOne.every((m) => m.from[0] === 5 && m.from[1] === 2)).toBe(true);
    expect(fromOne.length).toBeLessThan(all.length);
  });
});

describe('applyMove', () => {
  it('moves the piece and flips the turn', () => {
    const state = initialState();
    const move: Move = {
      from: [5, 2],
      to: [4, 3],
      steps: [[4, 3]],
      captures: [],
      promoted: false,
    };
    const next = applyMove(state, move);
    expect(next.board[5]![2]).toBeNull();
    expect(next.board[4]![3]).toMatchObject({ side: 'player', king: false });
    expect(next.turn).toBe('cpu');
    expect(next.moveCount).toBe(1);
    expect(next.movesWithoutProgress).toBe(1);
    expect(next.lastMove).toMatchObject({ from: [5, 2], to: [4, 3] });
    expect(next.history).toHaveLength(1);
  });

  it('throws on illegal move', () => {
    const state = initialState();
    const move: Move = {
      from: [5, 2],
      to: [3, 4], // too far
      steps: [[3, 4]],
      captures: [],
      promoted: false,
    };
    expect(() => applyMove(state, move)).toThrow(/illegal/i);
  });

  it('throws when game is not active', () => {
    const state = makeState(
      [{ row: 5, col: 2, side: 'player' }],
      'player',
      { status: 'draw' },
    );
    const move: Move = {
      from: [5, 2],
      to: [4, 3],
      steps: [[4, 3]],
      captures: [],
      promoted: false,
    };
    expect(() => applyMove(state, move, makeConfig({ forcedCaptures: false })))
      .toThrow(/not active/i);
  });

  it('does not mutate the input state', () => {
    const state = initialState();
    const snapshot = JSON.stringify(state);
    const move: Move = {
      from: [5, 2],
      to: [4, 3],
      steps: [[4, 3]],
      captures: [],
      promoted: false,
    };
    applyMove(state, move);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('movesEqual', () => {
  it('matches identical moves', () => {
    const a: Move = {
      from: [5, 2],
      to: [4, 3],
      steps: [[4, 3]],
      captures: [],
      promoted: false,
    };
    const b: Move = { ...a };
    expect(movesEqual(a, b)).toBe(true);
  });

  it('distinguishes moves with different captures', () => {
    const a: Move = {
      from: [5, 2],
      to: [3, 4],
      steps: [[3, 4]],
      captures: [[4, 3]],
      promoted: false,
    };
    const b: Move = {
      from: [5, 2],
      to: [3, 4],
      steps: [[3, 4]],
      captures: [[4, 1]],
      promoted: false,
    };
    expect(movesEqual(a, b)).toBe(false);
  });
});
