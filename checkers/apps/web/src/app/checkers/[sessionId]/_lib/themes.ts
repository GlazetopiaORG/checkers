/**
 * Board theme registry.
 *
 * Five themes, each a self-contained visual variant for the board, frame,
 * and comic cover. Themes are CSS-class driven; the actual styles live in
 * apps/web/src/styles/board-themes.css.
 *
 * Selection is deterministic from session ID — same session always shows
 * the same theme, so refreshing mid-game doesn't shuffle.
 *
 * Adding/replacing themes:
 *   1. Add or change a `BoardTheme` entry below
 *   2. Add matching CSS in board-themes.css under `.theme-<key>`
 *   3. (Optional) Drop cover art into public/comic/<key>.png and reference it
 *      via `coverArt` here — the ComicCover component falls back to pure-CSS
 *      composition when coverArt is undefined.
 */

export const THEME_KEYS = [
  'bakery',
  'glaze-gulch',
  'frosting',
  'unbaked',
  'comic',
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

export interface BoardTheme {
  /** The CSS class name used to scope theme styles. Always `theme-<key>`. */
  readonly cssClass: `theme-${ThemeKey}`;
  /** Comic-cover subtitle shown beneath "Glazetopia Checkers". */
  readonly subtitle: string;
  /** One-line flavor for the cover, beneath the subtitle. */
  readonly flavor: string;
  /**
   * Optional path under /public — when present, the cover hero panel uses
   * this image. When undefined, the cover falls back to pure-CSS composition
   * (using existing piece art from /public/pieces/).
   *
   * Drop a real image at this path to replace the placeholder:
   *   public/comic/<key>.png   (or .jpg, .webp — update the path)
   */
  readonly coverArt: string | undefined;
}

/**
 * All theme definitions. Order is intentional — the deterministic picker
 * uses array index, so adding a theme at the end preserves selection for
 * existing session IDs.
 */
export const THEMES: Record<ThemeKey, BoardTheme> = {
  bakery: {
    cssClass: 'theme-bakery',
    subtitle: 'Bakery Board',
    flavor: 'A duel in the warmth of Cookie Crumb Creek.',
    coverArt: undefined,
  },
  'glaze-gulch': {
    cssClass: 'theme-glaze-gulch',
    subtitle: 'Glaze Gulch Duel',
    flavor: 'Sunset over the donut frontier.',
    coverArt: undefined,
  },
  frosting: {
    cssClass: 'theme-frosting',
    subtitle: 'Frosting Frenzy',
    flavor: 'Sprinkles fly. Sugar wars.',
    coverArt: undefined,
  },
  unbaked: {
    cssClass: 'theme-unbaked',
    subtitle: 'Unbaked Corruption',
    flavor: 'Something hungers at the edge of the board.',
    coverArt: undefined,
  },
  comic: {
    cssClass: 'theme-comic',
    subtitle: 'Comic Clash',
    flavor: 'POW! BAM! Your move.',
    coverArt: undefined,
  },
};

/**
 * Pick a theme deterministically from a session id.
 *
 * Uses a simple but stable hash over the UUID's hex chars. The same session
 * id always yields the same theme; different sessions are evenly distributed.
 *
 * (This is the same approach used for things like avatar color hashing —
 * cheap, no crypto needed, only needs to feel random to the user.)
 */
export function pickThemeForSession(sessionId: string): ThemeKey {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    // Multiply-and-XOR — spreads small input variations across the space.
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % THEME_KEYS.length;
  return THEME_KEYS[idx]!;
}

/**
 * Convenience: get the full theme record for a session.
 */
export function themeForSession(sessionId: string): BoardTheme & { key: ThemeKey } {
  const key = pickThemeForSession(sessionId);
  return { key, ...THEMES[key] };
}
