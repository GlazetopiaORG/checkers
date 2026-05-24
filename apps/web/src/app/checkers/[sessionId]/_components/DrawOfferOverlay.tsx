/**
 * DrawOfferOverlay — full-screen modal shown when the backend has offered
 * a draw because the no-progress threshold has been reached.
 *
 * The player chooses one of three actions:
 *   - Keep Playing  → declineDraw()  — resets no-progress count, play continues
 *   - Accept Draw   → acceptDraw()   — session ends as 'draw', no mark
 *   - Resign        → resignSession() — session ends as 'abandoned', no mark
 *
 * The backend is the only authority — these buttons send requests; the
 * client cannot fake a result. If the session isn't in draw-offered state,
 * the server returns 409 and the overlay stays mounted with an error hint.
 */

'use client';

export interface DrawOfferOverlayProps {
  /** Number of moves since the last capture/promotion. Display only. */
  movesWithoutProgress: number;
  /** Disable all buttons while a request is in flight. */
  busy: boolean;
  /** Optional error to display from the last attempt. */
  errorMessage: string | null;
  onKeepPlaying: () => void;
  onAcceptDraw: () => void;
  onResign: () => void;
}

export function DrawOfferOverlay({
  movesWithoutProgress,
  busy,
  errorMessage,
  onKeepPlaying,
  onAcceptDraw,
  onResign,
}: DrawOfferOverlayProps): JSX.Element {
  return (
    <div
      className="overlay draw-offer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draw-offer-title"
    >
      <div className="overlay-card draw-offer__card">
        <h2 id="draw-offer-title" className="overlay-title draw">
          A Standstill
        </h2>
        <p className="overlay-body">
          {movesWithoutProgress} moves have passed without a capture or
          promotion. The board has settled. What's your call, partner?
        </p>

        {errorMessage && (
          <p
            className="overlay-body draw-offer__error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <div className="draw-offer__actions">
          <button
            type="button"
            className="draw-offer__btn draw-offer__btn--primary"
            onClick={onKeepPlaying}
            disabled={busy}
            aria-label="Keep playing — reset the no-progress count and continue the duel"
          >
            Keep Playing
          </button>
          <button
            type="button"
            className="draw-offer__btn"
            onClick={onAcceptDraw}
            disabled={busy}
            aria-label="Accept draw — end the session with no mark awarded"
          >
            Accept Draw
          </button>
          <button
            type="button"
            className="draw-offer__btn draw-offer__btn--danger"
            onClick={onResign}
            disabled={busy}
            aria-label="Resign — concede the game"
          >
            Resign
          </button>
        </div>

        <p
          className="overlay-body draw-offer__hint"
          style={{ fontSize: '0.78em' }}
        >
          A draw earns no mark.
        </p>
      </div>
    </div>
  );
}
