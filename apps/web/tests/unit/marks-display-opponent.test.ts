/**
 * Phase 5 HUD: verify the in-game header shows opponent-aware progress.
 *
 * This is the bug the player reported: starting Sheriff's Trial used to
 * show "0 / 3" because the HUD seeded marksRequired from the env-derived
 * fallback. After Phase 5, the HUD derives from opponent.
 *
 * We test the OPPONENT_DISPLAY constants and the registry contract.
 * The MarksDisplay component is small and pure — its render is exercised
 * indirectly through the existing GameClient flow.
 */

// Phase 5.0.2: belt-and-braces — see auth.test.ts.
import '../_test-env';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPPONENT_ID,
  OPPONENT_DISPLAY,
  OPPONENT_IDS,
  coerceOpponentId,
} from '../../src/app/checkers/[sessionId]/_lib/opponents';
import { OPPONENTS } from '../../src/lib/opponents';

describe('client opponent display registry (HUD source-of-truth pre-server)', () => {
  it('mirror has marksRequired for both opponents', () => {
    for (const id of OPPONENT_IDS) {
      expect(typeof OPPONENT_DISPLAY[id].marksRequired).toBe('number');
      expect(OPPONENT_DISPLAY[id].marksRequired).toBeGreaterThan(0);
    }
  });

  it('mirror matches server registry exactly (no drift)', () => {
    // This is the contract the comment in _lib/opponents.ts warns about.
    // If these ever diverge, the HUD shows the wrong threshold for one
    // move until the server response arrives — that's exactly the bug
    // we're fixing.
    expect(OPPONENT_DISPLAY.sheriff.marksRequired).toBe(
      OPPONENTS.sheriff.marksRequired,
    );
    expect(OPPONENT_DISPLAY.unbaked.marksRequired).toBe(
      OPPONENTS.unbaked.marksRequired,
    );
  });

  it('sheriff path requires 5 wins (the bug fix)', () => {
    expect(OPPONENT_DISPLAY.sheriff.marksRequired).toBe(5);
  });

  it('unbaked path requires 3 wins', () => {
    expect(OPPONENT_DISPLAY.unbaked.marksRequired).toBe(3);
  });

  it('every opponent has a pathName for the HUD label', () => {
    for (const id of OPPONENT_IDS) {
      const name = OPPONENT_DISPLAY[id].pathName;
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('coerceOpponentId narrows safely', () => {
    expect(coerceOpponentId('sheriff')).toBe('sheriff');
    expect(coerceOpponentId('unbaked')).toBe('unbaked');
    expect(coerceOpponentId(null)).toBe(DEFAULT_OPPONENT_ID);
    expect(coerceOpponentId(undefined)).toBe(DEFAULT_OPPONENT_ID);
    expect(coerceOpponentId('bogus')).toBe(DEFAULT_OPPONENT_ID);
  });
});
