/**
 * Phase 4.6.4 — server-side opponent registry tests.
 *
 * The registry is the source of truth for AI depth and marks-required.
 * Backend authority depends on this file being correct.
 */

// Phase 5.0.2: belt-and-braces — see auth.test.ts.
import '../_test-env';

import { describe, expect, it } from 'vitest';

import {
  coerceOpponentType,
  DEFAULT_OPPONENT,
  OPPONENT_TYPES,
  OPPONENTS,
  parseOpponentTypeStrict,
} from '../../src/lib/opponents';

describe('OPPONENT_TYPES', () => {
  it('lists exactly the two known opponent paths', () => {
    expect(OPPONENT_TYPES).toEqual(['sheriff', 'unbaked']);
  });
});

describe('OPPONENTS registry', () => {
  it('has matching entries for every id', () => {
    for (const id of OPPONENT_TYPES) {
      expect(OPPONENTS[id]).toBeDefined();
      expect(OPPONENTS[id].id).toBe(id);
    }
  });

  it('sheriff is easier (lower aiDepth) but requires more wins', () => {
    expect(OPPONENTS.sheriff.aiDepth).toBeLessThan(OPPONENTS.unbaked.aiDepth);
    expect(OPPONENTS.sheriff.marksRequired).toBeGreaterThan(
      OPPONENTS.unbaked.marksRequired,
    );
  });

  it('sheriff path = 4 wins, unbaked path = 2 wins', () => {
    expect(OPPONENTS.sheriff.marksRequired).toBe(4);
    expect(OPPONENTS.unbaked.marksRequired).toBe(2);
  });

  it('every preset has a non-empty displayName', () => {
    for (const id of OPPONENT_TYPES) {
      expect(OPPONENTS[id].displayName.length).toBeGreaterThan(0);
    }
  });
});

describe('coerceOpponentType', () => {
  it('passes through known ids', () => {
    expect(coerceOpponentType('sheriff')).toBe('sheriff');
    expect(coerceOpponentType('unbaked')).toBe('unbaked');
  });

  it('defaults on null / undefined / empty / unknown', () => {
    expect(coerceOpponentType(null)).toBe(DEFAULT_OPPONENT);
    expect(coerceOpponentType(undefined)).toBe(DEFAULT_OPPONENT);
    expect(coerceOpponentType('')).toBe(DEFAULT_OPPONENT);
    expect(coerceOpponentType('admin')).toBe(DEFAULT_OPPONENT);
    expect(coerceOpponentType('SHERIFF')).toBe(DEFAULT_OPPONENT); // case sensitive
  });

  it('default is unbaked (preserves pre-4.6.4 behavior)', () => {
    expect(DEFAULT_OPPONENT).toBe('unbaked');
  });
});

describe('parseOpponentTypeStrict', () => {
  it('returns known opponents', () => {
    expect(parseOpponentTypeStrict('sheriff')).toBe('sheriff');
    expect(parseOpponentTypeStrict('unbaked')).toBe('unbaked');
  });

  it('throws on unknown / bad input', () => {
    expect(() => parseOpponentTypeStrict('admin')).toThrow(/Invalid opponentType/);
    expect(() => parseOpponentTypeStrict(null)).toThrow(/Invalid opponentType/);
    expect(() => parseOpponentTypeStrict(42)).toThrow(/Invalid opponentType/);
    expect(() => parseOpponentTypeStrict({})).toThrow(/Invalid opponentType/);
    expect(() => parseOpponentTypeStrict('')).toThrow(/Invalid opponentType/);
  });
});
