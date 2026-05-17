/**
 * Board — renders 8x8 squares + pieces. Stateless; everything comes via props.
 */

'use client';

import type { Board as EngineBoard, Move, Position } from '@glazetopia/engine';

import { isDarkSquare, posKey, samePos } from '../_lib/coordinate';
import { PieceSkin } from './PieceSkin';

export interface BoardProps {
  board: EngineBoard;
  selected: Position | null;
  legalDestinations: Move[];
  lastMove: Move | null;
  /** Pieces that just got captured — rendered with a fade-out animation. */
  capturedPositions: Position[];
  /** Position that just got promoted — for the promote flash. */
  promotedPosition: Position | null;
  /** Whether clicks should be honored (false during animations/CPU turn). */
  interactive: boolean;
  onSquareClick: (row: number, col: number) => void;
}

export function Board(props: BoardProps): JSX.Element {
  const {
    board,
    selected,
    legalDestinations,
    lastMove,
    capturedPositions,
    promotedPosition,
    interactive,
    onSquareClick,
  } = props;

  // Build a lookup of destination positions and whether each is a capture.
  const destByKey = new Map<string, { captures: boolean }>();
  for (const m of legalDestinations) {
    destByKey.set(posKey(m.to), { captures: m.captures.length > 0 });
  }
  const capturedKeys = new Set(capturedPositions.map(posKey));

  return (
    <div
      className="board"
      role="grid"
      aria-label="Checkers board"
    >
      {Array.from({ length: 8 }).flatMap((_, row) =>
        Array.from({ length: 8 }).map((_, col) => {
          const dark = isDarkSquare(row, col);
          const cell = board[row]![col]!;
          const here: Position = [row, col];
          const isSelected = samePos(selected, here);
          const dest = destByKey.get(posKey(here));
          const isLastFrom = lastMove ? samePos(lastMove.from, here) : false;
          const isLastTo = lastMove ? samePos(lastMove.to, here) : false;
          const isPromoted = samePos(promotedPosition, here);
          const wasCaptured = capturedKeys.has(posKey(here));

          // Classes
          const cls: string[] = ['square'];
          cls.push(dark ? 'dark' : 'light');
          if (dark && interactive) cls.push('selectable');
          if (isSelected) cls.push('selected');
          if (dest) cls.push(dest.captures ? 'legal-capture' : 'legal-move');
          if (isLastFrom) cls.push('last-from');
          if (isLastTo) cls.push('last-to');

          // A square is clickable when:
          //  - the game is interactive AND
          //  - it's dark AND
          //  - it either holds one of our pieces (to select) OR is a legal destination
          const handleClick = interactive && dark
            ? () => onSquareClick(row, col)
            : undefined;

          return (
            <div
              key={`${row}-${col}`}
              className={cls.join(' ')}
              onClick={handleClick}
              role={dark ? 'gridcell' : 'presentation'}
              aria-label={
                dark
                  ? `Square ${String.fromCharCode(97 + col)}${8 - row}${cell ? ` — ${cell.side}${cell.king ? ' king' : ''}` : ''}`
                  : undefined
              }
            >
              {cell !== null && (
                <PieceSkin
                  side={cell.side}
                  king={cell.king}
                  className={[
                    wasCaptured ? 'captured' : '',
                    isPromoted ? 'promoted' : '',
                  ].filter(Boolean).join(' ')}
                />
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
