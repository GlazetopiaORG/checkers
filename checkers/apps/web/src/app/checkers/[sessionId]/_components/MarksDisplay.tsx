/**
 * MarksDisplay — header chip showing progression toward the level pass.
 *
 * Phase 5: opponent-aware. The label now reflects which path the player
 * is on:
 *   - Sheriff's Trial: 2 / 5
 *   - Unbaked Duel:    1 / 3
 *
 * Wins on one path never appear on the other path's chip — the HUD only
 * shows the path the current session is committed to. (The Discord
 * `/checkers-status` command is where you see both paths at once.)
 *
 * The number of required-marks is passed in from the parent, which gets
 * it from the most recent server response (or, before the first server
 * response, from the client display registry — see GameClient).
 */

'use client';

import { OPPONENT_DISPLAY, type OpponentId } from '../_lib/opponents';

export interface MarksDisplayProps {
  total: number;
  required: number;
  /** Pulse the newest dot on win. */
  justEarned: boolean;
  /**
   * Phase 5: which opponent path this session is on. Determines the
   * label (path name) shown on the chip.
   */
  opponent: OpponentId;
}

export function MarksDisplay({
  total,
  required,
  justEarned,
  opponent,
}: MarksDisplayProps): JSX.Element {
  const passed = total >= required;
  const pathName = OPPONENT_DISPLAY[opponent].pathName;

  return (
    <div className={`marks marks--${opponent}`} aria-live="polite">
      <span className="marks-label">{pathName}</span>
      {passed ? (
        <span className="marks-passed">Level passed!</span>
      ) : (
        <>
          <span
            className="marks-dots"
            role="img"
            aria-label={`${pathName}: ${total} of ${required} wins`}
          >
            {Array.from({ length: required }).map((_, i) => {
              const filled = i < total;
              const isNew = justEarned && i === total - 1;
              return (
                <span
                  key={i}
                  className={[
                    'marks-dot',
                    filled ? 'filled' : '',
                    isNew ? 'just-earned' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              );
            })}
          </span>
          <span style={{ color: 'var(--ui-text-dim)' }}>
            {total} / {required}
          </span>
        </>
      )}
    </div>
  );
}
