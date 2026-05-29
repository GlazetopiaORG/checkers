/**
 * ComicCover — the opening panel a player taps to start a duel.
 *
 * Phase 4.6.4 changes:
 *   - Embeds an OpponentPicker below the CharacterPicker. The face-off
 *     hero image now shows player vs opponent based on both selections.
 *   - The "Tap to open" CTA commits BOTH selections to the backend in
 *     one call. The cover only lifts after the backend confirms.
 *
 * The component itself doesn't call the API — it bubbles the chosen
 * character + opponent via props, and emits onOpen() when the player
 * commits. GameClient owns the commit logic.
 *
 * Layout (top to bottom):
 *   [Banner]      "GLAZETOPIA"
 *   [Hero]        chosen hero VS chosen opponent face-off
 *   [Footer]      Title + theme subtitle + flavor
 *   [Char picker] 6 hero thumbnails
 *   [Opp picker]  2 opponent cards
 *   [CTA]         "Tap to open the comic ↗" — single button
 */

'use client';

import { CHARACTERS, type CharacterId } from '../_lib/characters';
import { OPPONENT_DISPLAY, type OpponentId } from '../_lib/opponents';
import type { BoardTheme } from '../_lib/themes';
import { CharacterPicker } from './CharacterPicker';
import { OpponentPicker } from './OpponentPicker';

// Phase 5.0.9: module-load canary for the ComicCover (the actual button
// that calls commit). If the 409 happens but this log doesn't appear,
// either ComicCover never mounts (impossible — the button has to render
// for the click to fire) or the deployed bundle predates 5.0.9.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log(
    '%c[ComicCover] LIVE COMIC COVER MODULE LOADED — phase5.0.9',
    'background:#222;color:#5fe46a;font-weight:bold;padding:4px 8px;border-radius:4px;',
  );
}

export interface ComicCoverProps {
  theme: BoardTheme;
  /** Currently chosen character — drives the player side of the face-off. */
  selectedCharacter: CharacterId;
  /** Currently chosen opponent — drives the CPU side of the face-off. */
  selectedOpponent: OpponentId;
  /** Called when the player taps a different character thumbnail. */
  onCharacterChange: (id: CharacterId) => void;
  /** Called when the player taps a different opponent card. */
  onOpponentChange: (id: OpponentId) => void;
  /** Called when the player taps the "Open the comic" CTA. */
  onOpen: () => void;
  /** When true, disable the CTA and show busy state (commit in flight). */
  busy?: boolean;
  /** Optional error to display below the CTA after a failed commit. */
  errorMessage?: string | null;
}

export function ComicCover({
  theme,
  selectedCharacter,
  selectedOpponent,
  onCharacterChange,
  onOpponentChange,
  onOpen,
  busy = false,
  errorMessage = null,
}: ComicCoverProps): JSX.Element {
  const character = CHARACTERS[selectedCharacter];
  const opponent = OPPONENT_DISPLAY[selectedOpponent];

  return (
    <div
      className="cover"
      role="group"
      aria-label={`Comic cover — ${theme.subtitle}. Choose your hero and opponent, then tap to open.`}
    >
      <div className="cover-banner" aria-hidden="true">
        Glazetopia
      </div>

      {theme.coverArt ? (
        <div
          className="cover-hero cover-hero--image"
          style={{ backgroundImage: `url("${theme.coverArt}")` }}
          aria-hidden="true"
        />
      ) : (
        <div className="cover-hero" aria-hidden="true">
          <div className="cover-faceoff">
            <img
              src={character.manArt}
              alt=""
              className="cover-faceoff-piece player"
              draggable={false}
            />
            <span className="cover-faceoff-vs">VS</span>
            <img
              src={opponent.manArt}
              alt=""
              className="cover-faceoff-piece cpu"
              draggable={false}
            />
          </div>
        </div>
      )}

      <div className="cover-footer">
        <h2 className="cover-title">Glazetopia Checkers</h2>
        <div className="cover-subtitle">{theme.subtitle}</div>
        <div className="cover-flavor">{theme.flavor}</div>
      </div>

      <CharacterPicker
        selectedCharacter={selectedCharacter}
        onChange={onCharacterChange}
      />

      <OpponentPicker
        selectedOpponent={selectedOpponent}
        onChange={onOpponentChange}
      />

      <button
        type="button"
        className="cover-open-btn"
        onClick={(e) => {
          // Phase 5.0.9: guaranteed click log. If the user taps this
          // button and this log does NOT appear, the rendered button
          // is from a different component (or the build doesn't have
          // 5.0.9). If the log appears but the next [checkers/cover-open]
          // doesn't, the parent's onOpen handler is the wrong function.
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line no-console
            console.log('[ComicCover] BUTTON CLICKED', {
              busy,
              opponent: opponent.id,
              character: character.id,
              onOpenIsFn: typeof onOpen === 'function',
            });
          }
          onOpen();
        }}
        disabled={busy}
        aria-label={`Open the comic to face ${opponent.displayName} as ${character.displayName}`}
      >
        {busy ? 'Opening…' : 'Tap to open the comic ↗'}
      </button>

      {errorMessage && (
        <div className="cover-error" role="alert">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
