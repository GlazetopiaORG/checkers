/**
 * PieceSkin — the ONLY component that knows what piece art looks like.
 *
 * Phase 4.6.3 changes:
 *   - Player art is now driven by the chosen character (D'Lish, Uncle,
 *     Jellybean, Caramel, Wild Buck, or Honeycomb). The character is
 *     passed in as a prop by the parent (GameClient → Board → PieceSkin)
 *     so this component stays pure and easy to test.
 *   - CPU stays Unbaked. Always. The Unbaked is the antagonist, not a
 *     pickable hero.
 *
 * Phase 4.5 history (still applies):
 *   - PNG character art with king effects layered via CSS
 *   - className hooks for capture/landing/promotion animations
 *
 * To add or change a character:
 *   - Edit _lib/characters.ts (add an entry to CHARACTERS)
 *   - Drop man.png + king.png into public/pieces/<id>/
 *   - This file does not need to change.
 *
 * To change CPU art (no code changes required):
 *   - Drop new files into public/pieces/ keeping the names
 *     cpu-man.png and cpu-king.png
 */

import type { Side } from '@glazetopia/engine';

import { CHARACTERS, DEFAULT_CHARACTER, type CharacterId } from '../_lib/characters';
import { OPPONENT_DISPLAY, type OpponentId } from '../_lib/opponents';

// Per-opponent CPU display labels (the label is for accessibility / aria-label;
// the art path comes from OPPONENT_DISPLAY).
const OPPONENT_LABEL: Record<OpponentId, { man: string; king: string }> = {
  sheriff: { man: 'Sheriff Buttercream', king: 'Sheriff Buttercream (deputized)' },
  unbaked: { man: 'Unbaked', king: 'Unbaked (true form)' },
};

export interface PieceSkinProps {
  side: Side;
  king: boolean;
  /**
   * The currently chosen player character. Determines player-piece art.
   * Required: parents pass this from their session-level state.
   * CPU pieces ignore this — they're driven by `opponent` instead.
   */
  playerCharacter: CharacterId;
  /**
   * Phase 4.6.4: the opponent path — determines CPU piece art and
   * accessibility label. Required.
   */
  opponent: OpponentId;
  /**
   * Animation flags driven by the parent Board:
   *   - justLanded:    piece just arrived here (play jump-land anim)
   *   - captured:      piece is fading out from a capture (play melt anim)
   *   - promoted:      piece just got kinged (play flash anim)
   */
  justLanded?: boolean;
  captured?: boolean;
  promoted?: boolean;
  /** Extra class names — escape hatch for future special states. */
  className?: string;
}

export function PieceSkin({
  side,
  king,
  playerCharacter,
  opponent,
  justLanded = false,
  captured = false,
  promoted = false,
  className = '',
}: PieceSkinProps): JSX.Element {
  const kind = king ? 'king' : 'man';
  const character =
    CHARACTERS[playerCharacter] ?? CHARACTERS[DEFAULT_CHARACTER];
  const opponentInfo = OPPONENT_DISPLAY[opponent];
  const opponentLabels = OPPONENT_LABEL[opponent];

  let src: string;
  let label: string;
  if (side === 'player') {
    src = king ? character.kingArt : character.manArt;
    label = king
      ? `${character.displayName} (kinged)`
      : character.displayName;
  } else {
    src = king ? opponentInfo.kingArt : opponentInfo.manArt;
    label = opponentLabels[kind];
  }

  // Layered CSS hooks. Adds `opponent-<id>` so themes can target the
  // CPU's art per-opponent if needed.
  const wrapClasses = [
    'piece-wrap',
    king ? 'king' : '',
    side === 'player'
      ? king
        ? 'player-king'
        : 'player-man'
      : king
        ? 'cpu-king'
        : 'cpu-man',
    side === 'cpu' ? `opponent-${opponent}` : '',
    justLanded ? 'just-landed' : '',
    captured ? 'captured' : '',
    promoted ? 'promoted' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={wrapClasses} aria-label={label} role="img">
      <img src={src} alt="" className="piece" draggable={false} />
    </span>
  );
}
