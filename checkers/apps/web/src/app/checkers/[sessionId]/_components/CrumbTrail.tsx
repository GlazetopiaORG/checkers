/**
 * CrumbTrail — the side panel beside the board on desktop, stacked below
 * on mobile. Reads from _content/crumb-trail.ts and from current game state.
 *
 * Never writes. Never fetches. Pure render of props + static content.
 *
 * To edit any text in this panel, you do NOT need to touch this file.
 * Edit `_content/crumb-trail.ts` instead — every string in this component
 * comes from there.
 */

'use client';

import {
  CRUMB_TRAIL_CONTENT,
  pickCrumbForSession,
  pickTipForSession,
} from '../_content/crumb-trail';
import { OPPONENT_DISPLAY, type OpponentId } from '../_lib/opponents';
import type { BoardTheme, ThemeKey } from '../_lib/themes';

export type CrumbTrailPhase =
  | 'your-turn'
  | 'sending-move'
  | 'unbaked-thinking'
  | 'won'
  | 'lost'
  | 'draw'
  | 'abandoned'
  | 'expired';

export interface CrumbTrailProps {
  /** Session id — used to pick a deterministic crumb + tip. */
  sessionId: string;
  /** The chosen board theme — drives the lore line and visual tokens. */
  theme: BoardTheme & { key: ThemeKey };
  /** Current game phase. Determines the "Turn" row value. */
  phase: CrumbTrailPhase;
  /** Marks toward level pass (on the current opponent's path). */
  marksTotal: number;
  /** Marks required for a pass (per-opponent: 3 for Unbaked, 5 for Sheriff). */
  marksRequired: number;
  /** Total moves played in this session. Row hidden when 0. */
  moveCount: number;
  /** Phase 4.6.4: the opponent path — drives "Path" label + lore. */
  opponent: OpponentId;
  /**
   * True iff it's the player's turn AND they have at least one legal
   * move whose `captures.length > 0`. The panel uses this to surface
   * the rule that captures are forced, without revealing which piece.
   */
  capturesAvailable: boolean;
  /**
   * Whether to render the panel as visible. The parent controls this:
   * the panel is hidden until the comic cover flips open, then fades in.
   */
  visible: boolean;
}

export function CrumbTrail(props: CrumbTrailProps): JSX.Element {
  const {
    sessionId,
    theme,
    phase,
    marksTotal,
    marksRequired,
    moveCount,
    opponent,
    capturesAvailable,
    visible,
  } = props;

  const c = CRUMB_TRAIL_CONTENT;
  const crumb = pickCrumbForSession(sessionId);
  const tip = pickTipForSession(sessionId);
  const themeLore = c.themeLore[theme.key];
  const opponentInfo = OPPONENT_DISPLAY[opponent];

  // Phase 4.6.4: per-opponent lore line shown next to the path label.
  // Pulled from crumb-trail.ts so editors can change copy without touching
  // React components.
  const opponentLore = c.opponentLore[opponent];

  const turnValue = turnValueFor(phase, c.duelLabels, opponent);
  const showMoveCount = moveCount > 0;
  const showCapturesRow = capturesAvailable;

  return (
    <aside
      className={`crumb-trail ${visible ? 'visible' : 'hidden'}`}
      aria-label="The Crumb Trail — Glazetopia lore panel"
      aria-hidden={!visible}
    >
      <header className="crumb-trail__header">
        <h2 className="crumb-trail__title">{c.header.panelTitle}</h2>
        <div className="crumb-trail__subtitle">{c.header.panelSubtitle}</div>
      </header>

      {/* ───── Section: Path (Phase 4.6.4) ───── */}
      <section className="crumb-trail__section">
        <div className="crumb-trail__section-label">{c.sections.path}</div>
        <div className="crumb-trail__theme-name">{opponentInfo.pathName}</div>
        {opponentLore && (
          <p className="crumb-trail__lore">{opponentLore}</p>
        )}
      </section>

      {/* ───── Section: Theme Lore ───── */}
      <section className="crumb-trail__section">
        <div className="crumb-trail__section-label">{c.sections.themeLore}</div>
        <div className="crumb-trail__theme-name">{theme.subtitle}</div>
        {themeLore && (
          <p className="crumb-trail__lore">{themeLore}</p>
        )}
      </section>

      {/* ───── Section: Duel Status ───── */}
      <section className="crumb-trail__section">
        <div className="crumb-trail__section-label">{c.sections.duelStatus}</div>
        <dl className="crumb-trail__status">
          <div className="crumb-trail__row">
            <dt>{c.duelLabels.turn}</dt>
            <dd className={`crumb-trail__turn crumb-trail__turn--${turnVariant(phase)}`}>
              {turnValue}
            </dd>
          </div>

          <div className="crumb-trail__row">
            <dt>{c.duelLabels.marks}</dt>
            <dd>
              <strong>{marksTotal}</strong> / {marksRequired}
            </dd>
          </div>

          {showMoveCount && (
            <div className="crumb-trail__row">
              <dt>{c.duelLabels.moveCount}</dt>
              <dd>{moveCount}</dd>
            </div>
          )}

          {showCapturesRow && (
            <div className="crumb-trail__row crumb-trail__row--alert">
              <dt>{c.duelLabels.capturesAvailable}</dt>
              <dd>{c.duelLabels.capturesValue}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ───── Section: Crumb (mystery line) ───── */}
      {crumb && (
        <section className="crumb-trail__section">
          <div className="crumb-trail__section-label">{c.sections.loreCrumb}</div>
          <blockquote className="crumb-trail__crumb">{crumb}</blockquote>
        </section>
      )}

      {/* ───── Tip ───── */}
      {tip && (
        <footer className="crumb-trail__tip">{tip}</footer>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------

function turnValueFor(
  phase: CrumbTrailPhase,
  labels: typeof CRUMB_TRAIL_CONTENT.duelLabels,
  opponent: OpponentId,
): string {
  switch (phase) {
    case 'your-turn':
    case 'sending-move':
      return labels.yourTurn;
    case 'unbaked-thinking':
      // The phase is named historically — but the actual label adapts
      // to whichever opponent the session is on.
      return opponent === 'sheriff' ? labels.sheriffTurn : labels.unbakedTurn;
    case 'won':
    case 'lost':
    case 'draw':
    case 'abandoned':
    case 'expired':
      return labels.gameOver;
    default:
      return labels.yourTurn;
  }
}

function turnVariant(phase: CrumbTrailPhase): 'player' | 'cpu' | 'over' {
  if (phase === 'your-turn' || phase === 'sending-move') return 'player';
  if (phase === 'unbaked-thinking') return 'cpu';
  return 'over';
}
