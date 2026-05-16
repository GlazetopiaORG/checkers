/**
 * GameStatusBar — current turn indicator and resign button.
 */

'use client';

export interface GameStatusBarProps {
  /** What to display as the current state. */
  state:
    | 'your-turn'
    | 'unbaked-thinking'
    | 'sending-move'
    | 'won'
    | 'lost'
    | 'draw'
    | 'abandoned'
    | 'expired'
    | 'loading';
  onResign: () => void;
  /** Disable resign during animations or when the game has ended. */
  canResign: boolean;
}

const STATE_LABEL: Record<GameStatusBarProps['state'], { text: string; cls: 'player' | 'cpu' | '' }> = {
  'your-turn':         { text: 'Your turn',                  cls: 'player' },
  'unbaked-thinking':  { text: 'The Unbaked considers…',     cls: 'cpu' },
  'sending-move':      { text: 'Playing…',                   cls: 'player' },
  'won':               { text: 'You won',                    cls: 'player' },
  'lost':              { text: 'The Unbaked feeds',          cls: 'cpu' },
  'draw':              { text: 'Draw',                       cls: '' },
  'abandoned':         { text: 'Abandoned',                  cls: '' },
  'expired':           { text: 'Session expired',            cls: '' },
  'loading':           { text: 'Loading…',                   cls: '' },
};

export function GameStatusBar({
  state,
  onResign,
  canResign,
}: GameStatusBarProps): JSX.Element {
  const { text, cls } = STATE_LABEL[state];
  return (
    <div className="status">
      <span className={`status-turn ${cls}`}>{text}</span>
      <button
        type="button"
        className="status-resign"
        onClick={onResign}
        disabled={!canResign}
        aria-label="Resign the current game"
      >
        Resign
      </button>
    </div>
  );
}
