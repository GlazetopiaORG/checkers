/**
 * Internal rule primitives: direction vectors, capture-chain detection.
 * Consumers should use moves.ts (legalMoves / applyMove) instead.
 */

import { cloneBoard, isInBounds } from './board';
import type { GameConfig } from './config';
import type { Board, Cell, Move, Piece, Position, Side } from './types';

/** All four diagonal direction vectors as [dRow, dCol]. */
const ALL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, +1],
  [+1, -1],
  [+1, +1],
];

/**
 * Which diagonal directions a piece may move in.
 * Men can only move toward the opponent's back rank.
 * Kings can move in all four diagonals (when configured).
 */
export function directionsFor(
  piece: Piece,
  config: GameConfig,
): ReadonlyArray<readonly [number, number]> {
  if (piece.king && config.kingMovesBothDirections) {
    return ALL_DIRECTIONS;
  }
  if (piece.king) {
    // Kings forced to move forward only (variant rule).
    return piece.side === 'player'
      ? [
          [-1, -1],
          [-1, +1],
        ]
      : [
          [+1, -1],
          [+1, +1],
        ];
  }
  // Men move forward only.
  return piece.side === 'player'
    ? [
        [-1, -1],
        [-1, +1],
      ]
    : [
        [+1, -1],
        [+1, +1],
      ];
}

/** True if this piece would be promoted by landing on the given row. */
export function wouldPromote(piece: Piece, landingRow: number): boolean {
  if (piece.king) return false;
  if (piece.side === 'player' && landingRow === 0) return true;
  if (piece.side === 'cpu' && landingRow === 7) return true;
  return false;
}

/**
 * Generate all simple (non-capture) slides from the given square.
 * Caller is responsible for ensuring the square holds the right side's piece.
 */
export function simpleMovesFrom(
  board: Board,
  from: Position,
  config: GameConfig,
): Move[] {
  const piece = board[from[0]]![from[1]]!;
  if (piece === null) return [];

  const moves: Move[] = [];
  for (const [dr, dc] of directionsFor(piece, config)) {
    const tr = from[0] + dr;
    const tc = from[1] + dc;
    if (!isInBounds(tr, tc)) continue;
    if (board[tr]![tc] !== null) continue;

    const to: Position = [tr, tc];
    moves.push({
      from,
      to,
      steps: [to],
      captures: [],
      promoted: wouldPromote(piece, tr),
    });
  }
  return moves;
}

/**
 * Generate all capture moves from the given square — including multi-jump
 * chains. Implements the rule that a man being kinged mid-chain MUST stop
 * (standard American checkers).
 *
 * Algorithm: depth-first search. At each square the current piece can land,
 * try every direction; if an enemy piece is adjacent and the square beyond
 * is empty, recurse with the captured piece removed. Terminate the chain
 * when no further captures are available, OR when the moving piece would
 * be promoted by this hop.
 */
export function captureMovesFrom(
  board: Board,
  from: Position,
  config: GameConfig,
): Move[] {
  const piece = board[from[0]]![from[1]]!;
  if (piece === null) return [];

  const results: Move[] = [];

  // DFS state we pass through recursion.
  type Frame = {
    pos: Position;
    piece: Piece;
    board: Board;
    steps: Position[];
    captured: Position[];
  };

  const enemy: Side = piece.side === 'player' ? 'cpu' : 'player';

  function recurse(frame: Frame): void {
    let extended = false;

    for (const [dr, dc] of directionsFor(frame.piece, config)) {
      const midRow = frame.pos[0] + dr;
      const midCol = frame.pos[1] + dc;
      const landRow = frame.pos[0] + 2 * dr;
      const landCol = frame.pos[1] + 2 * dc;

      if (!isInBounds(landRow, landCol)) continue;
      const mid = frame.board[midRow]![midCol]!;
      const land = frame.board[landRow]![landCol]!;
      if (mid === null || mid.side !== enemy) continue;
      if (land !== null) continue;

      // Prevent capturing the same piece twice in one chain.
      // (Defensive — board cloning below already removes captured pieces,
      //  so this can only matter if board references leak.)
      if (
        frame.captured.some((c) => c[0] === midRow && c[1] === midCol)
      ) {
        continue;
      }

      // Build the post-hop board: lift mover, remove captured piece, place mover.
      const nextBoard = cloneBoard(frame.board);
      nextBoard[frame.pos[0]]![frame.pos[1]] = null;
      nextBoard[midRow]![midCol] = null;

      const justPromoted = wouldPromote(frame.piece, landRow);
      const nextPiece: Piece = justPromoted
        ? { side: frame.piece.side, king: true }
        : frame.piece;
      nextBoard[landRow]![landCol] = nextPiece;

      const nextSteps = [...frame.steps, [landRow, landCol] as Position];
      const nextCaptured = [
        ...frame.captured,
        [midRow, midCol] as Position,
      ];

      // Standard rule: a man being kinged mid-chain stops the chain.
      // If the piece was already a king, no promotion happens, chain continues normally.
      if (justPromoted) {
        results.push({
          from,
          to: [landRow, landCol],
          steps: nextSteps,
          captures: nextCaptured,
          promoted: true,
        });
        extended = true;
        continue;
      }

      // Try to continue the chain from the landing square.
      const before = results.length;
      recurse({
        pos: [landRow, landCol],
        piece: nextPiece,
        board: nextBoard,
        steps: nextSteps,
        captured: nextCaptured,
      });
      const after = results.length;

      if (after === before) {
        // No further captures from here — this is a terminal chain.
        results.push({
          from,
          to: [landRow, landCol],
          steps: nextSteps,
          captures: nextCaptured,
          promoted: false,
        });
      }
      extended = true;
    }

    // If `extended` is false at the root, the caller (captureMovesFrom)
    // will see an empty results array, which is the correct answer.
    void extended;
  }

  recurse({
    pos: from,
    piece,
    board,
    steps: [],
    captured: [],
  });

  return results;
}

/**
 * Apply a move to a board, returning a new board. Pure.
 * Does NOT validate the move — assumes the caller has verified it is legal.
 * Use this in concert with applyMove() from moves.ts which handles state-level concerns.
 */
export function applyMoveToBoard(board: Board, move: Move): Cell[][] {
  const next = cloneBoard(board);
  const piece = next[move.from[0]]![move.from[1]]!;
  if (piece === null) {
    throw new Error(
      `applyMoveToBoard: no piece at from=${move.from[0]},${move.from[1]}`,
    );
  }
  next[move.from[0]]![move.from[1]] = null;
  for (const [r, c] of move.captures) {
    next[r]![c] = null;
  }
  const finalPiece: Piece = move.promoted
    ? { side: piece.side, king: true }
    : piece;
  next[move.to[0]]![move.to[1]] = finalPiece;
  return next;
}
