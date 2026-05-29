/**
 * Board — renders 8x8 squares + pieces.
 *
 * Phase 4.5 changes:
 *   - Wraps the grid in `.board-frame` for the gingerbread/glaze frame
 *   - Accepts justLandedPosition so the destination piece animates its arrival
 *   - Passes captured/promoted/justLanded flags through to PieceSkin
 *
 * Stateless; all state comes via props.
 */

'use client';

import type { Board as EngineBoard, Move, Position } from '@glazetopia/engine';

import { isDarkSquare, posKey, samePos } from '../_lib/coordinate';
import { PieceSkin } from './PieceSkin';
import type { CharacterId } from '../_lib/characters';
import type { OpponentId } from '../_lib/opponents';

export interface BoardProps {
  board: EngineBoard;
  selected: Position | null;
  legalDestinations: Move[];
  lastMove: Move | null;
  /** Pieces that just got captured — rendered with melt animation. */
  capturedPositions: Position[];
  /** Position that just got promoted — for the promote flash. */
  promotedPosition: Position | null;
  /** Position of the piece that just arrived — plays the jump-land animation. */
  justLandedPosition: Position | null;
  /** Whether clicks should be honored (false during animations/CPU turn). */
  interactive: boolean;
  /** The chosen player character — passed through to PieceSkin. */
  playerCharacter: CharacterId;
  /** Phase 4.6.4: the opponent path — controls CPU piece art. */
  opponent: OpponentId;
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
    justLandedPosition,
    interactive,
    playerCharacter,
    opponent,
    onSquareClick,
  } = props;

  const destByKey = new Map<string, { captures: boolean }>();
  for (const m of legalDestinations) {
    destByKey.set(posKey(m.to), { captures: m.captures.length > 0 });
  }
  const capturedKeys = new Set(capturedPositions.map(posKey));

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label="Checkers board">
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
            const isJustLanded = samePos(justLandedPosition, here);
            const wasCaptured = capturedKeys.has(posKey(here));

            const cls: string[] = ['square'];
            cls.push(dark ? 'light' : 'dark');
            // NOTE: the dark/light flip is intentional — engine considers
            // (row+col) odd squares as the *playable* dark squares (where
            // pieces sit), but historically checkers boards visually render
            // those as the darker color. We follow that convention.
            cls.length = 0;
            cls.push('square');
            cls.push(dark ? 'dark' : 'light');
            if (dark && interactive) cls.push('selectable');
            if (isSelected) cls.push('selected');
            if (dest) cls.push(dest.captures ? 'legal-capture' : 'legal-move');
            if (isLastFrom) cls.push('last-from');
            if (isLastTo) cls.push('last-to');

            const handleClick =
              interactive && dark ? () => onSquareClick(row, col) : undefined;

            return (
              <div
                key={`${row}-${col}`}
                className={cls.join(' ')}
                onClick={handleClick}
                role={dark ? 'gridcell' : 'presentation'}
                aria-label={
                  dark
                    ? `Square ${String.fromCharCode(97 + col)}${8 - row}${
                        cell ? ` — ${cell.side}${cell.king ? ' king' : ''}` : ''
                      }`
                    : undefined
                }
              >
                {cell !== null && (
                  <PieceSkin
                    side={cell.side}
                    king={cell.king}
                    playerCharacter={playerCharacter}
                    opponent={opponent}
                    justLanded={isJustLanded}
                    captured={wasCaptured}
                    promoted={isPromoted}
                  />
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
