/**
 * Persisted character preference.
 *
 * Currently stored in localStorage. The key is namespaced under
 * "glazetopia.checkers.*" so we don't collide with anything else the
 * Glazetopia frontend might add later.
 *
 * Safe-by-default semantics:
 *   - All reads coerce to a known CharacterId (or DEFAULT_CHARACTER)
 *   - Storage failures (SSR, private mode, quota) are swallowed — they
 *     return the default rather than throwing
 *
 * No PII, no secrets, no tokens here. Just a cosmetic preference.
 */

import {
  coerceCharacterId,
  DEFAULT_CHARACTER,
  type CharacterId,
} from './characters';

const STORAGE_KEY = 'glazetopia.checkers.character';

/**
 * Read the saved character. Falls back to default if:
 *   - localStorage isn't available (SSR, private browsing mode)
 *   - the key is missing
 *   - the stored value isn't a known character id (someone tampered)
 */
export function loadCharacter(): CharacterId {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return coerceCharacterId(raw);
  } catch {
    return DEFAULT_CHARACTER;
  }
}

/**
 * Save the chosen character. Silent failure if storage is unavailable.
 * Returns true on success, false on failure (caller can ignore — the
 * picker will still work, the value just won't persist this session).
 */
export function saveCharacter(id: CharacterId): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
