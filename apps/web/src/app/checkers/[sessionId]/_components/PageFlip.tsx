/**
 * PageFlip — wraps a cover face and a board face, animates a 3D rotation
 * to flip from one to the other.
 *
 * Usage:
 *   <PageFlip flipped={flipped}>
 *     <PageFlipFront><ComicCover ... /></PageFlipFront>
 *     <PageFlipBack><Board ... /></PageFlipBack>
 *   </PageFlip>
 *
 * The actual rotation lives in CSS — see .page-flip in checkers.css.
 * This component only sets the `flipped` class on the outer container.
 *
 * Reduced motion: the CSS swaps the 3D rotation for an instant face swap,
 * so this component doesn't need to special-case anything.
 */

'use client';

import type { ReactNode } from 'react';

export interface PageFlipProps {
  /** When true, the inner element rotates to reveal the back face. */
  flipped: boolean;
  children: ReactNode;
}

export function PageFlip({ flipped, children }: PageFlipProps): JSX.Element {
  return (
    <div className={`page-flip ${flipped ? 'flipped' : ''}`}>
      <div className="page-flip__inner">{children}</div>
    </div>
  );
}

export function PageFlipFront({ children }: { children: ReactNode }): JSX.Element {
  return <div className="page-flip__face page-flip__face--cover">{children}</div>;
}

export function PageFlipBack({ children }: { children: ReactNode }): JSX.Element {
  return <div className="page-flip__face page-flip__face--board">{children}</div>;
}
