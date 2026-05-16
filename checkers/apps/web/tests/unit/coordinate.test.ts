/**
 * Unit tests for client-side coordinate helpers. Pure functions, no DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  isDarkSquare,
  posKey,
  samePos,
} from '../../src/app/checkers/[sessionId]/_lib/coordinate';

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
