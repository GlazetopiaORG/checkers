/**
 * Public move API.
 *
 * legalMoves(state)               — all legal moves for the side to move
 * legalMoves(state, config, from) — legal moves from a specific square
 * applyMove(state, move)          — apply a move and return new state
 */

import { piecesOf, samePosition } from './board.js';
import { defaultConfig, type GameConfig } from './config.js';
import {
  applyMoveToBoard,
  captureMovesFrom,
  simpleMovesFrom,
} from './rules.js';
import type { GameState, Move, Position, Side } from './types.js';
import { detectWinner } from './winner.js';

/**
 * All legal moves for the side to move in the given state.
 * Respects forced-capture and capture-rule config.
 *
 * @param state  Current game state.
 * @param config Optional rule config; defaults applied if omitted.
 * @param from   Optional: restrict to moves originating at this square.
 *               Useful when the UI has selected a piece and wants its options.
 */
export function legalMoves(
  state: GameState,
  config: GameConfig = defaultConfig,
  from?: Position,
): Move[] {
  if (state.status !== 'active') return [];

  const side: Side = state.turn;
  const allCaptures: Move[] = [];
  const allSimple: Move[] = [];

  for (const pos of piecesOf(state.board, side)) {
    if (from && !samePosition(pos, from)) continue;
    allCaptures.push(...captureMovesFrom(state.board, pos, config));
    allSimple.push(...simpleMovesFrom(state.board, pos, config));
  }

  // Forced-capture rule: if any captures exist for this side, simple moves
  // are illegal. Note we check captures across the whole board, not just
  // from the requested `from` square — this matters when the UI asks
  // "what can THIS piece do?" while a different piece has a mandatory jump.
  let captures = allCaptures;
  let simple = allSimple;

  if (config.forcedCaptures) {
    // Determine whether ANY of the side's pieces can capture (board-wide).
    let anyCaptureExists = captures.length > 0;
    if (!anyCaptureExists && from) {
      // We were restricted to `from` — recompute board-wide to know.
      for (const pos of piecesOf(state.board, side)) {
        if (captureMovesFrom(state.board, pos, config).length > 0) {
          anyCaptureExists = true;
          break;
        }
      }
    }
    if (anyCaptureExists) {
      simple = [];
    }
  }

  // captureRule: 'maximum' filters captures to only the longest chains.
  if (config.captureRule === 'maximum' && captures.length > 0) {
    // We must consider the maximum across the WHOLE board, not just `from`.
    let maxLen = 0;
    if (from) {
      for (const pos of piecesOf(state.board, side)) {
        for (const m of captureMovesFrom(state.board, pos, config)) {
          if (m.captures.length > maxLen) maxLen = m.captures.length;
        }
      }
    } else {
      for (const m of captures) {
        if (m.captures.length > maxLen) maxLen = m.captures.length;
      }
    }
    captures = captures.filter((m) => m.captures.length === maxLen);
  }

  return [...captures, ...simple];
}

/**
 * Apply a move and return the resulting state.
 * Validates the move against `legalMoves`. Throws if illegal.
 *
 * This validation is what makes the engine safe to call from the backend
 * with untrusted client input — bad moves cannot corrupt state.
 */
export function applyMove(
  state: GameState,
  move: Move,
  config: GameConfig = defaultConfig,
): GameState {
  if (state.status !== 'active') {
    throw new Error(`applyMove: game is not active (status=${state.status})`);
  }

  const legals = legalMoves(state, config);
  const found = legals.find((m) => movesEqual(m, move));
  if (!found) {
    throw new Error(
      `applyMove: illegal move from=${move.from[0]},${move.from[1]} to=${move.to[0]},${move.to[1]}`,
    );
  }

  // Use the canonical legal move (not the caller-supplied one) so that
  // fields like `steps`, `captures`, `promoted` are guaranteed correct
  // even if the client sent a partial or malformed move object.
  const canonical = found;

  const nextBoard = applyMoveToBoard(state.board, canonical);
  const progress = canonical.captures.length > 0 || canonical.promoted;
  const nextTurn: Side = state.turn === 'player' ? 'cpu' : 'player';

  const draft: GameState = {
    board: nextBoard,
    turn: nextTurn,
    status: 'active',
    moveCount: state.moveCount + 1,
    movesWithoutProgress: progress ? 0 : state.movesWithoutProgress + 1,
    lastMove: canonical,
    history: [...state.history, canonical],
  };

  // Recompute status (win/loss/draw) after the move.
  return { ...draft, status: detectWinner(draft, config) };
}

/**
 * Compare two moves for engine equality. We compare from/to/captures
 * because that fully determines the move; `steps` is derived and
 * `promoted` is computed.
 *
 * Captures are order-sensitive: the same set of captured pieces taken
 * in a different sequence is a different move (and may have different
 * intermediate squares).
 */
export function movesEqual(a: Move, b: Move): boolean {
  if (!samePosition(a.from, b.from)) return false;
  if (!samePosition(a.to, b.to)) return false;
  if (a.captures.length !== b.captures.length) return false;
  for (let i = 0; i < a.captures.length; i++) {
    if (!samePosition(a.captures[i]!, b.captures[i]!)) return false;
  }
  return true;
}
