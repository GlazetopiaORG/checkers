/**
 * PageLift — overlay-based comic-cover reveal.
 *
 * Replaces the earlier 3D PageFlip approach, which had two problems:
 *   1. In some iframe / browser combos, the back face wasn't fully
 *      hidden during the flip — the board could leak through the cover.
 *   2. The 3D flip required both faces to be exactly the same size,
 *      which conflicted with the new unified stage layout (board + panel
 *      together, cover spanning the whole stage).
 *
 * The new approach:
 *   - The cover is an absolutely-positioned overlay sitting on top of
 *     the entire game stage during intro.
 *   - The stage content underneath is visually masked (the overlay is
 *     opaque AND the stage's interactive content is hidden via opacity +
 *     pointer-events).
 *   - On tap, the cover does a single-axis "page lift": rotates ~85° on
 *     its bottom edge while fading, like a page being lifted off a book.
 *   - After the animation completes, the cover unmounts.
 *
 * Pure CSS — no animation libraries. GPU-accelerated transform only.
 * Reduced-motion users get an instant fade instead of the lift.
 */

'use client';

import type { ReactNode } from 'react';

export interface PageLiftProps {
  /** When true, the cover lifts away and reveals the children underneath. */
  lifted: boolean;
  /** The cover element shown over the stage during intro. */
  cover: ReactNode;
  /** The actual game stage content — board, panel, etc. */
  children: ReactNode;
}

export function PageLift({ lifted, cover, children }: PageLiftProps): JSX.Element {
  return (
    <div className={`page-lift ${lifted ? 'lifted' : ''}`}>
      {/* The stage content is always mounted so its sizing drives the
          parent's dimensions. While !lifted it's visually hidden and
          pointer-events disabled so the player can only see/interact with
          the cover. */}
      <div className="page-lift__stage" aria-hidden={!lifted}>
        {children}
      </div>
      {/* Cover is rendered while !lifted, and during the lift animation.
          After the animation finishes the CSS sets pointer-events: none
          and visibility: hidden so it's fully out of the way. */}
      <div className="page-lift__cover" aria-hidden={lifted}>
        {cover}
      </div>
    </div>
  );
}
