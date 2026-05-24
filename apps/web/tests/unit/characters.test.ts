/**
 * Unit tests for the character registry + storage layer.
 *
 * The registry is small and entirely declarative, so most of these tests
 * are structural (does it have all six characters? do all paths exist?).
 * The storage layer needs slightly more — coercion, defaults, SSR safety.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHARACTER_IDS,
  CHARACTERS,
  coerceCharacterId,
  DEFAULT_CHARACTER,
  getAllowedCharacters,
} from '../../src/app/checkers/[sessionId]/_lib/characters';
import {
  loadCharacter,
  saveCharacter,
} from '../../src/app/checkers/[sessionId]/_lib/character-storage';

// ----------------------------------------------------------------------------
// Registry shape
// ----------------------------------------------------------------------------

describe('CHARACTER_IDS', () => {
  it('contains all six expected heroes', () => {
    expect(CHARACTER_IDS).toEqual([
      'dlish',
      'uncle',
      'jellybean',
      'caramel',
      'wildbuck',
      'honeycomb',
    ]);
  });

  it('has no duplicates', () => {
    const set = new Set(CHARACTER_IDS);
    expect(set.size).toBe(CHARACTER_IDS.length);
  });
});

describe('CHARACTERS registry', () => {
  it('has an entry for every id in CHARACTER_IDS', () => {
    for (const id of CHARACTER_IDS) {
      expect(CHARACTERS[id]).toBeDefined();
      expect(CHARACTERS[id].id).toBe(id);
    }
  });

  it('every character has a non-empty displayName and tagline', () => {
    for (const id of CHARACTER_IDS) {
      const c = CHARACTERS[id];
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(c.tagline.length).toBeGreaterThan(0);
    }
  });

  it('every character has both manArt and kingArt paths under /pieces/<id>/', () => {
    for (const id of CHARACTER_IDS) {
      const c = CHARACTERS[id];
      expect(c.manArt).toMatch(new RegExp(`^/pieces/${id}/man\\.png$`));
      expect(c.kingArt).toMatch(new RegExp(`^/pieces/${id}/king\\.png$`));
    }
  });
});

describe('getAllowedCharacters', () => {
  it('returns all six characters today (no gating yet)', () => {
    const allowed = getAllowedCharacters();
    expect(allowed).toHaveLength(6);
    const ids = allowed.map((c) => c.id);
    expect(ids).toEqual([...CHARACTER_IDS]);
  });

  it('returns a fresh array (callers can sort/filter without mutating registry)', () => {
    const a = getAllowedCharacters();
    const b = getAllowedCharacters();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ----------------------------------------------------------------------------
// Coercion
// ----------------------------------------------------------------------------

describe('coerceCharacterId', () => {
  it('returns valid ids unchanged', () => {
    for (const id of CHARACTER_IDS) {
      expect(coerceCharacterId(id)).toBe(id);
    }
  });

  it('returns the default for null', () => {
    expect(coerceCharacterId(null)).toBe(DEFAULT_CHARACTER);
  });

  it('returns the default for undefined', () => {
    expect(coerceCharacterId(undefined)).toBe(DEFAULT_CHARACTER);
  });

  it('returns the default for unknown strings (e.g. localStorage tampering)', () => {
    expect(coerceCharacterId('not-a-real-character')).toBe(DEFAULT_CHARACTER);
    expect(coerceCharacterId('')).toBe(DEFAULT_CHARACTER);
    expect(coerceCharacterId('admin')).toBe(DEFAULT_CHARACTER);
  });

  it('does NOT return random or arbitrary characters', () => {
    // Defensive: if someone changes the implementation to e.g. partial match,
    // this should still fail. A string that contains 'dlish' but isn't dlish
    // must not be coerced to dlish.
    expect(coerceCharacterId('dlish-extra')).toBe(DEFAULT_CHARACTER);
    expect(coerceCharacterId('DLISH')).toBe(DEFAULT_CHARACTER); // case sensitive
  });
});

// ----------------------------------------------------------------------------
// Storage layer
// ----------------------------------------------------------------------------

describe('loadCharacter / saveCharacter', () => {
  const STORAGE_KEY = 'glazetopia.checkers.character';

  beforeEach(() => {
    // jsdom-style localStorage stub
    const store = new Map<string, string>();
    const stub = {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: vi.fn((k: string) => {
        store.delete(k);
      }),
      clear: vi.fn(() => store.clear()),
      key: vi.fn((i: number) => Array.from(store.keys())[i] ?? null),
      get length() {
        return store.size;
      },
    } as unknown as Storage;
    vi.stubGlobal('localStorage', stub);
    vi.stubGlobal('window', { localStorage: stub });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadCharacter returns the default when nothing is stored', () => {
    expect(loadCharacter()).toBe(DEFAULT_CHARACTER);
  });

  it('saveCharacter persists and loadCharacter reads back', () => {
    expect(saveCharacter('caramel')).toBe(true);
    expect(loadCharacter()).toBe('caramel');
  });

  it('loadCharacter coerces tampered values to the default', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-a-real-character');
    expect(loadCharacter()).toBe(DEFAULT_CHARACTER);
  });

  it('loadCharacter survives storage throwing', () => {
    const throwingStub = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    vi.stubGlobal('localStorage', throwingStub);
    vi.stubGlobal('window', { localStorage: throwingStub });

    expect(loadCharacter()).toBe(DEFAULT_CHARACTER);
  });

  it('saveCharacter returns false when storage throws', () => {
    const throwingStub = {
      getItem: vi.fn(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    vi.stubGlobal('localStorage', throwingStub);
    vi.stubGlobal('window', { localStorage: throwingStub });

    expect(saveCharacter('uncle')).toBe(false);
  });
});
