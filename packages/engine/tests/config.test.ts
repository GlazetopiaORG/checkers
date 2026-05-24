import { describe, expect, it } from 'vitest';

import { defaultConfig, makeConfig } from '../src/config';
import { legalMoves } from '../src/moves';
import { makeState } from './_helpers';

describe('defaultConfig', () => {
  it('uses standard American checkers rules', () => {
    expect(defaultConfig.captureRule).toBe('any');
    expect(defaultConfig.forcedCaptures).toBe(true);
    expect(defaultConfig.multiJumpMandatory).toBe(true);
    expect(defaultConfig.kingMovesBothDirections).toBe(true);
    expect(defaultConfig.aiDepth).toBe(4);
  });
});

describe('makeConfig overrides', () => {
  it('overrides only specified fields', () => {
    const c = makeConfig({ aiDepth: 2 });
    expect(c.aiDepth).toBe(2);
    expect(c.captureRule).toBe('any');
    expect(c.forcedCaptures).toBe(true);
  });
});

describe('captureRule: maximum', () => {
  it("forces the longest capture chain when set to 'maximum'", () => {
    // Player at (5,2). Option A: single capture (one CPU adjacent, nothing further).
    // Option B: double capture (two CPU pieces in a chain).
    //
    // To make this concrete:
    //   Player at (5,0).  CPU at (4,1).  Empty (3,2).  Empty (4,3).      <- single jump
    //   Player at (5,4).  CPU at (4,5).  Empty (3,6).  CPU at (2,5).
    //                                                  Empty (1,4).      <- double jump
    //
    // Wait — Player at (5,4) jumping (4,5) lands at (3,6). From (3,6),
    // jumping (2,5) lands at (1,4). That's a double for that piece.
    // From (5,0), jumping (4,1) lands at (3,2). From (3,2), would need
    // a piece at (2,1) or (2,3) to continue; we leave those empty so the
    // chain ends after 1 capture.
    const state = makeState(
      [
        { row: 5, col: 0, side: 'player' },
        { row: 4, col: 1, side: 'cpu' },
        { row: 5, col: 4, side: 'player' },
        { row: 4, col: 5, side: 'cpu' },
        { row: 2, col: 5, side: 'cpu' },
      ],
      'player',
    );

    const standard = legalMoves(state, makeConfig({ captureRule: 'any' }));
    const lengths = standard.map((m) => m.captures.length).sort();
    expect(lengths).toEqual([1, 2]); // both chains legal under 'any'

    const max = legalMoves(state, makeConfig({ captureRule: 'maximum' }));
    expect(max).toHaveLength(1);
    expect(max[0]!.captures).toHaveLength(2);
  });
});

describe('forcedCaptures: false', () => {
  it('allows simple moves alongside captures when disabled', () => {
    const state = makeState(
      [
        { row: 5, col: 2, side: 'player' },
        { row: 4, col: 3, side: 'cpu' },
        { row: 5, col: 6, side: 'player' },
      ],
      'player',
    );
    const forced = legalMoves(state, makeConfig({ forcedCaptures: true }));
    // Only the capture
    expect(forced).toHaveLength(1);

    const optional = legalMoves(state, makeConfig({ forcedCaptures: false }));
    // Capture + simple slides from both pieces
    expect(optional.length).toBeGreaterThan(forced.length);
  });
});

describe('kingMovesBothDirections: false', () => {
  it('restricts kings to forward movement when disabled', () => {
    const state = makeState(
      [{ row: 4, col: 3, side: 'player', king: true }],
      'player',
    );
    const bidirectional = legalMoves(
      state,
      makeConfig({ kingMovesBothDirections: true }),
    );
    const forwardOnly = legalMoves(
      state,
      makeConfig({ kingMovesBothDirections: false }),
    );
    expect(bidirectional.length).toBeGreaterThan(forwardOnly.length);
    // Forward-only player king moves only to row 3.
    expect(forwardOnly.every((m) => m.to[0] === 3)).toBe(true);
  });
});

describe('drawAfterMovesWithoutProgress', () => {
  it('is configurable for faster draw detection', () => {
    // We don't simulate 40+ moves here; we just check the threshold is read.
    const c = makeConfig({ drawAfterMovesWithoutProgress: 5 });
    expect(c.drawAfterMovesWithoutProgress).toBe(5);
  });
});
