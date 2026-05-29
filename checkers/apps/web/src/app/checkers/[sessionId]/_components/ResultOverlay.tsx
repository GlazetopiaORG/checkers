/**
 * ResultOverlay — full-screen end-of-game card. Shows mark progress and a CTA.
 */

'use client';

import type { GameStatus } from '@glazetopia/engine';

type EndStatus = GameStatus | 'abandoned' | 'expired';

export interface ResultOverlayProps {
  status: EndStatus;
  marksTotal: number;
  marksRequired: number;
  levelPassed: boolean;
}

const COPY: Record<EndStatus, { title: string; titleClass: string; body: string }> = {
  won: {
    title: 'Mark earned',
    titleClass: 'win',
    body:
      "You've banished this Unbaked back to the Void. The wind tastes like sugar again — for now.",
  },
  lost: {
    title: 'The Unbaked feeds',
    titleClass: 'lose',
    body: "The shadow rolled over you. Steady up, kid, and try again.",
  },
  draw: {
    title: 'Stalemate',
    titleClass: 'draw',
    body: 'Neither side gave ground. No mark this round — line up another duel.',
  },
  abandoned: {
    title: 'Walked away',
    titleClass: 'draw',
    body: 'Session resigned. The Unbaked drifts back into the void.',
  },
  expired: {
    title: 'Session expired',
    titleClass: 'draw',
    body: 'This duel timed out. Start a new one from Discord.',
  },
  active: { title: '', titleClass: '', body: '' }, // unreachable
};

export function ResultOverlay({
  status,
  marksTotal,
  marksRequired,
  levelPassed,
}: ResultOverlayProps): JSX.Element {
  const copy = COPY[status];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ov-title">
      <div className="overlay-card">
        <h2 id="ov-title" className={`overlay-title ${copy.titleClass}`}>{copy.title}</h2>
        <p className="overlay-body">{copy.body}</p>

        {levelPassed ? (
          <p className="overlay-body" style={{ color: 'var(--ui-success)', fontWeight: 600 }}>
            Three marks gathered. You&apos;ve cleared this hollow of the Unbaked.
          </p>
        ) : (
          <p className="overlay-body">
            Marks: <strong>{marksTotal} / {marksRequired}</strong>
            {status === 'won' && marksTotal < marksRequired && (
              <> · {marksRequired - marksTotal} more to pass this level</>
            )}
          </p>
        )}

        <p className="overlay-body" style={{ fontSize: '0.85em' }}>
          Return to Discord and run <code>/checkers</code> for another duel.
        </p>
      </div>
    </div>
  );
}
