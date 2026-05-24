# Board themes & comic covers

Glazetopia Checkers ships with five board themes, picked **deterministically from the session ID** — same session always shows the same theme; different sessions are randomly distributed.

Themes:

| Key | Subtitle | Mood |
| --- | --- | --- |
| `bakery` | Bakery Board | Default — warm Cookie Crumb Creek |
| `glaze-gulch` | Glaze Gulch Duel | Frontier sunset |
| `frosting` | Frosting Frenzy | Pastel celebration |
| `unbaked` | Unbaked Corruption | Antagonist, void-green |
| `comic` | Comic Clash | Halftone yellow + red, POW/BAM |

## How theming works

All theming is **CSS-class driven**:

1. `apps/web/src/app/checkers/[sessionId]/_lib/themes.ts` — the registry.
2. `apps/web/src/styles/board-themes.css` — the CSS variant overrides.
3. `apps/web/src/app/checkers/[sessionId]/_components/GameClient.tsx` — applies `.theme-<key>` to the page shell.

No backend changes. No game-rule changes. The theme picker is pure client-side.

## Replacing or adding theme art

### Cover art

By default each cover renders a "D'Lish vs Unbaked" face-off composed from the existing piece art in `apps/web/public/pieces/`. To use a custom cover image for any theme:

1. Drop a file into `apps/web/public/comic/` — for example `apps/web/public/comic/glaze-gulch.png`.
2. Edit `themes.ts` and set the `coverArt` field for that theme:
   ```ts
   'glaze-gulch': {
     // ...
     coverArt: '/comic/glaze-gulch.png',
   },
   ```
3. Save. The cover renders the image instead of the piece face-off.

Recommended cover size: ~800x800 pixels, PNG with transparency or JPEG with a flat background. The hero panel is square so non-square images will be cropped center.

### Square / frame styling

Edit `apps/web/src/styles/board-themes.css`. Each theme overrides ~10 CSS custom properties scoped to `.theme-<key>`. Change the values, no JS change required.

### Adding a sixth theme

1. Add a new key to `THEME_KEYS` and entry in `THEMES` in `themes.ts`.
2. Add a `.theme-<newkey>` block in `board-themes.css`.
3. Add the new theme at the **end** of `THEME_KEYS` so existing session IDs keep their assigned themes.

That's it. No component changes.

## The page-flip animation

When a session is fresh, the player sees the comic cover. Tapping it triggers a CSS 3D `rotateY(-180deg)` over 900 ms, revealing the board behind. The cover unmounts after the flip.

If the player refreshes mid-game (the session already has moves), the cover is auto-skipped so they jump straight back to play. Developers can also append `#skip-intro` to the URL to skip the cover.

Reduced-motion users see an instant face swap instead of the 3D rotation.

## Performance

Total weight added by Phase 4.6:
- `board-themes.css`: ~3 KB gzipped
- Cover-related additions in `checkers.css`: ~2 KB gzipped
- No new HTTP requests (all themes are pure CSS by default)

The 3D transform is GPU-accelerated and tested fine in Discord iframes on mobile.
