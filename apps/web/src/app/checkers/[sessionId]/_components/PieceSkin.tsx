/**
 * PieceSkin — the ONLY component that knows what piece art looks like.
 *
 * To swap art:
 *   1. Drop new SVG/PNG files into `public/pieces/`
 *   2. Update the path map below
 *   3. Done. Engine and game logic don't know art exists.
 *
 * The component renders a plain <img> so we get HTTP caching and lazy
 * decoding for free. Animation classes are applied by the parent.
 */

import type { Side } from '@glazetopia/engine';

// Single source of truth for piece art. The whole game's visual identity
// flows from this map — swap any value to repaint.
const PIECE_ART: Record<`${Side}-${'man' | 'king'}`, string> = {
  'player-man':  '/pieces/player-man.svg',
  'player-king': '/pieces/player-king.svg',
  'cpu-man':     '/pieces/cpu-man.svg',
  'cpu-king':    '/pieces/cpu-king.svg',
};

const PIECE_LABEL: Record<`${Side}-${'man' | 'king'}`, string> = {
  'player-man':  "D'Lish",
  'player-king': "D'Lish (kinged)",
  'cpu-man':     'Unbaked',
  'cpu-king':    'Unbaked (true form)',
};

export interface PieceSkinProps {
  side: Side;
  king: boolean;
  /** Extra class names — used by parent for animation states. */
  className?: string;
}

export function PieceSkin({
  side,
  king,
  className = '',
}: PieceSkinProps): JSX.Element {
  const kind = (king ? 'king' : 'man') as 'man' | 'king';
  const key = `${side}-${kind}` as const;
  const src = PIECE_ART[key];
  const label = PIECE_LABEL[key];
  const sideClass = side === 'player'
    ? (king ? 'player-king' : 'player-man')
    : (king ? 'cpu-king' : 'cpu-man');

  return (
    <img
      src={src}
      alt={label}
      className={`piece ${sideClass} ${className}`.trim()}
      draggable={false}
    />
  );
}
