/**
 * CharacterPicker — 6-character horizontal picker shown on the comic cover.
 *
 * Tapping a thumbnail calls onChange(id) — the parent owns the selected
 * state and pre-fills the picker on next render. The picker doesn't
 * write to localStorage itself; the parent does that when the player
 * commits by opening the comic.
 *
 * Currently all six characters are unlocked. The picker reads the
 * allowlist from `getAllowedCharacters()` so when collectible gating
 * arrives, only the UI's data source needs to change — the picker
 * itself stays the same.
 *
 * Accessibility: a radiogroup with arrow-key navigation between thumbnails.
 */

'use client';

import { getAllowedCharacters, type CharacterId } from '../_lib/characters';

export interface CharacterPickerProps {
  selectedCharacter: CharacterId;
  onChange: (id: CharacterId) => void;
}

export function CharacterPicker({
  selectedCharacter,
  onChange,
}: CharacterPickerProps): JSX.Element {
  const characters = getAllowedCharacters();
  const selected = characters.find((c) => c.id === selectedCharacter) ?? characters[0]!;

  return (
    <div className="character-picker" role="radiogroup" aria-label="Choose your hero">
      <div className="character-picker__label">Choose your hero</div>

      <div className="character-picker__row">
        {characters.map((c) => {
          const isSelected = c.id === selectedCharacter;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={c.displayName}
              className={`character-picker__thumb${isSelected ? ' selected' : ''}`}
              onClick={(e: { stopPropagation: () => void }) => {
                // Don't bubble to the cover; we don't want a thumbnail tap
                // to also trigger any ambient click handlers.
                e.stopPropagation();
                onChange(c.id);
              }}
            >
              <img
                src={c.manArt}
                alt=""
                className="character-picker__art"
                draggable={false}
              />
              <span className="character-picker__name">{c.displayName}</span>
            </button>
          );
        })}
      </div>

      <div className="character-picker__tagline" aria-live="polite">
        {selected.tagline}
      </div>
    </div>
  );
}
