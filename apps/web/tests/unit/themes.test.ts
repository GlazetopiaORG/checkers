/**
 * Unit tests for the deterministic theme picker.
 *
 * The picker must be:
 *   - Deterministic: same session ID always yields the same theme
 *   - Cover all 5 themes given enough variety of inputs
 *   - Return a known theme key (no undefined / out-of-range)
 */

import { describe, expect, it } from 'vitest';

import {
  pickThemeForSession,
  THEME_KEYS,
  THEMES,
  themeForSession,
} from '../../src/app/checkers/[sessionId]/_lib/themes';

describe('pickThemeForSession', () => {
  it('is deterministic for a given session id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const a = pickThemeForSession(id);
    const b = pickThemeForSession(id);
    expect(a).toBe(b);
  });

  it('returns a known theme key', () => {
    const theme = pickThemeForSession('any-id');
    expect(THEME_KEYS).toContain(theme);
  });

  it('distributes across all five themes given varied input', () => {
    const seen = new Set<string>();
    // 200 randomly-shaped UUIDs should cover all 5 buckets with very high
    // probability (≈100%) for any reasonable hash distribution.
    for (let i = 0; i < 200; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-${(i * 13).toString(16).padStart(4, '0').slice(0, 4)}-4xxx-yxxx-xxxxxxxxxxxx`;
      seen.add(pickThemeForSession(id));
    }
    expect(seen.size).toBe(THEME_KEYS.length);
  });

  it('different ids generally give different themes', () => {
    // Probabilistic but extremely safe: 5 themes, 50 random ids, we should
    // see at least 2 different themes.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(pickThemeForSession(`session-${i}-${i * 7}`));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('themeForSession', () => {
  it('returns the full theme record plus key', () => {
    const t = themeForSession('11111111-2222-3333-4444-555555555555');
    expect(THEME_KEYS).toContain(t.key);
    expect(t.cssClass).toBe(`theme-${t.key}`);
    expect(t.subtitle).toBeTruthy();
    expect(t.flavor).toBeTruthy();
  });
});

describe('THEMES registry', () => {
  it('has an entry for every theme key', () => {
    for (const k of THEME_KEYS) {
      expect(THEMES[k]).toBeDefined();
      expect(THEMES[k].cssClass).toBe(`theme-${k}`);
    }
  });

  it('every theme has a subtitle and flavor', () => {
    for (const k of THEME_KEYS) {
      expect(THEMES[k].subtitle).toBeTruthy();
      expect(THEMES[k].flavor).toBeTruthy();
    }
  });

  it('subtitle copy matches the spec (not "Atomic Undoing")', () => {
    expect(THEMES.bakery.subtitle).toBe('Bakery Board');
    expect(THEMES['glaze-gulch'].subtitle).toBe('Glaze Gulch Duel');
    expect(THEMES.frosting.subtitle).toBe('Frosting Frenzy');
    expect(THEMES.unbaked.subtitle).toBe('Unbaked Corruption');
    expect(THEMES.comic.subtitle).toBe('Comic Clash');
    for (const k of THEME_KEYS) {
      expect(THEMES[k].subtitle.toLowerCase()).not.toContain('atomic undoing');
    }
  });
});
