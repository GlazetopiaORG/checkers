/**
 * OpponentPicker — choose between Sheriff Buttercream and The Unbaked.
 *
 * Shown on the comic cover, BELOW the CharacterPicker. The selection here
 * is sent to the backend at cover-open commit time. Once the session is
 * committed (status = 'active'), the opponent cannot be changed.
 *
 * The picker shows two cards side by side: each card displays the
 * opponent's display name, art, intensity label, and a flavor line.
 * Tapping a card selects that path; visual feedback (gold ring, slight
 * lift) mirrors the CharacterPicker styling.
 *
 * Accessibility: a radiogroup of two options. Either keyboard arrow keys
 * or tap selects.
 */

'use client';

import {
  OPPONENT_DISPLAY,
  OPPONENT_IDS,
  type OpponentId,
} from '../_lib/opponents';

export interface OpponentPickerProps {
  selectedOpponent: OpponentId;
  onChange: (id: OpponentId) => void;
}

export function OpponentPicker({
  selectedOpponent,
  onChange,
}: OpponentPickerProps): JSX.Element {
  const selected = OPPONENT_DISPLAY[selectedOpponent];

  return (
    <div className="opponent-picker" role="radiogroup" aria-label="Choose your opponent">
      <div className="opponent-picker__label">Choose your opponent</div>

      <div className="opponent-picker__row">
        {OPPONENT_IDS.map((id) => {
          const opp = OPPONENT_DISPLAY[id];
          const isSelected = id === selectedOpponent;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${opp.displayName} — ${opp.intensityLabel}`}
              className={`opponent-picker__card${isSelected ? ' selected' : ''}`}
              onClick={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                onChange(id);
              }}
            >
              <img
                src={opp.manArt}
                alt=""
                className="opponent-picker__art"
                draggable={false}
              />
              <div className="opponent-picker__name">{opp.displayName}</div>
              <div className="opponent-picker__intensity">{opp.intensityLabel}</div>
            </button>
          );
        })}
      </div>

      <div className="opponent-picker__tagline" aria-live="polite">
        {selected.tagline}
      </div>
    </div>
  );
}
