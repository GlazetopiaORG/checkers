/**
 * Character registry.
 *
 * Six selectable heroes that the player can play as. The CPU is always
 * the Unbaked — that's not pickable. Choice is purely cosmetic; the
 * engine, backend, and game rules don't know about it.
 *
 * Selection is stored client-side in localStorage (see character-storage.ts).
 *
 * FUTURE EXTENSION: when the member portal restricts characters by
 * collected cards, the `getAllowedCharacters()` function below will
 * change to fetch the unlocked list. The picker UI and PieceSkin
 * mapping don't need to change.
 *
 * To add or change a character:
 *   1. Drop man/king art into public/pieces/<id>/{man,king}.png
 *   2. Add a CHARACTERS entry below
 *   3. Add the id to the CharacterId union — TypeScript will guide you
 */

export const CHARACTER_IDS = [
  'dlish',
  'uncle',
  'jellybean',
  'caramel',
  'wildbuck',
  'honeycomb',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface Character {
  readonly id: CharacterId;
  /** Display name shown in the picker. */
  readonly displayName: string;
  /** One short flavor line shown when this character is selected. */
  readonly tagline: string;
  /** Path under /public for the "man" piece art. */
  readonly manArt: string;
  /** Path under /public for the "king" piece art. */
  readonly kingArt: string;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  dlish: {
    id: 'dlish',
    displayName: "D'Lish",
    tagline: "The Sheriff's Hand. Carries a sword that's seen a few duels.",
    manArt: '/pieces/dlish/man.png',
    kingArt: '/pieces/dlish/king.png',
  },
  uncle: {
    id: 'uncle',
    displayName: 'Uncle',
    tagline: 'Old enough to remember the recipe. Loud enough to argue about it.',
    manArt: '/pieces/uncle/man.png',
    kingArt: '/pieces/uncle/king.png',
  },
  jellybean: {
    id: 'jellybean',
    displayName: 'Jellybean',
    tagline: "Smaller than she looks. Faster than you'd guess.",
    manArt: '/pieces/jellybean/man.png',
    kingArt: '/pieces/jellybean/king.png',
  },
  caramel: {
    id: 'caramel',
    displayName: 'Caramel',
    tagline: 'Sticky in a fight. Sweet at the end of one.',
    manArt: '/pieces/caramel/man.png',
    kingArt: '/pieces/caramel/king.png',
  },
  wildbuck: {
    id: 'wildbuck',
    displayName: 'Wild Buck',
    tagline: 'Bow steady, eye keen, donut hole always loaded.',
    manArt: '/pieces/wildbuck/man.png',
    kingArt: '/pieces/wildbuck/king.png',
  },
  honeycomb: {
    id: 'honeycomb',
    displayName: 'Honeycomb',
    tagline: 'Sees the threads other folks miss. Hexes optional.',
    manArt: '/pieces/honeycomb/man.png',
    kingArt: '/pieces/honeycomb/king.png',
  },
};

/** Default character — used when nothing has been chosen yet. */
export const DEFAULT_CHARACTER: CharacterId = 'dlish';

/**
 * Return the list of characters the player is allowed to choose from.
 *
 * Today: all six unlocked. No gating.
 *
 * Future: when member-portal collectible gating exists, this becomes
 * an async fetch returning only the unlocked characters for the user.
 * The picker UI doesn't change — it just renders whatever this returns.
 *
 * Returning a stable copy (not the readonly registry) so callers can
 * sort/filter without TypeScript readonly fights.
 */
export function getAllowedCharacters(): Character[] {
  return CHARACTER_IDS.map((id) => CHARACTERS[id]);
}

/**
 * Type-narrowing helper: if the input is a known character id, return it;
 * otherwise return the default. Used when reading from localStorage,
 * which is untrusted string data.
 */
export function coerceCharacterId(raw: string | null | undefined): CharacterId {
  if (raw && (CHARACTER_IDS as readonly string[]).includes(raw)) {
    return raw as CharacterId;
  }
  return DEFAULT_CHARACTER;
}
