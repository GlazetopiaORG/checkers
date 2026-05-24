/**
 * The Unbaked AI.
 *
 * Algorithm: minimax with alpha-beta pruning. Evaluation is from the CPU's
 * perspective — positive scores favor the CPU (the Unbaked), negative scores
 * favor the player.
 *
 * Determinism: when multiple moves score equally, the first one encountered
 * wins. This keeps tests stable. To make the Unbaked feel less robotic in
 * production you can wrap `cpuMove` and pick randomly among top moves.
 */

import { piecesOf } from './board';
import { defaultConfig, type GameConfig } from './config';
import { applyMove, legalMoves } from './moves';
import type { Board, GameState, Move, Piece, Side } from './types';

// Evaluation weights — tuned by intuition; can be refined later.
const MAN_VALUE = 100;
const KING_VALUE = 175;
const ADVANCEMENT_BONUS = 2; // per row advanced
const BACK_RANK_BONUS = 4; // for a man still on its home back rank
const MOBILITY_BONUS = 0.5; // per legal move available

const TERMINAL_SCORE = 1_000_000;

/**
 * Static evaluation of a board state from the CPU's perspective.
 * Higher = better for CPU; lower = better for player.
 */
export function evaluate(
  state: GameState,
  config: GameConfig = defaultConfig,
): number {
  if (state.status === 'lost') return +TERMINAL_SCORE; // player lost = CPU won
  if (state.status === 'won') return -TERMINAL_SCORE; // player won
  if (state.status === 'draw') return 0;

  let score = 0;
  score += materialAndPositionScore(state.board);

  // Mobility: prefer states where CPU has more legal moves than player.
  // We don't apply this on every node; only at the root and shallow nodes
  // would be ideal, but for MVP simplicity we apply it everywhere.
  const cpuMobility = countLegalMoves(state, 'cpu', config);
  const playerMobility = countLegalMoves(state, 'player', config);
  score += (cpuMobility - playerMobility) * MOBILITY_BONUS;

  return score;
}

function materialAndPositionScore(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    const row = board[r]!;
    for (let c = 0; c < 8; c++) {
      const cell = row[c]!;
      if (cell === null) continue;
      const sideSign = cell.side === 'cpu' ? +1 : -1;
      const base = cell.king ? KING_VALUE : MAN_VALUE;
      score += sideSign * base;

      if (!cell.king) {
        // Advancement: how far has this man moved from its starting back rank?
        if (cell.side === 'cpu') {
          score += sideSign * r * ADVANCEMENT_BONUS;
          if (r === 0) score += sideSign * BACK_RANK_BONUS;
        } else {
          score += sideSign * (7 - r) * ADVANCEMENT_BONUS;
          if (r === 7) score += sideSign * BACK_RANK_BONUS;
        }
      }
    }
  }
  return score;
}

/** Count legal moves for a side WITHOUT changing turn — used for mobility eval. */
function countLegalMoves(
  state: GameState,
  side: Side,
  config: GameConfig,
): number {
  if (state.turn === side) {
    return legalMoves(state, config).length;
  }
  // Temporarily flip turn for counting.
  const swapped: GameState = { ...state, turn: side, status: 'active' };
  return legalMoves(swapped, config).length;
}

/**
 * Choose the Unbaked's move from the current state.
 * Returns null if no legal move exists (the game is over).
 *
 * Throws if called when it is not the CPU's turn — defensive guard against
 * caller bugs; should never happen in normal use.
 */
export function cpuMove(
  state: GameState,
  config: GameConfig = defaultConfig,
): Move | null {
  if (state.status !== 'active') return null;
  if (state.turn !== 'cpu') {
    throw new Error(
      `cpuMove: called when it is not the CPU's turn (turn=${state.turn})`,
    );
  }

  const moves = legalMoves(state, config);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0]!;

  let bestMove: Move = moves[0]!;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = +Infinity;

  for (const move of moves) {
    const next = applyMove(state, move, config);
    const score = minimax(next, config.aiDepth - 1, alpha, beta, false, config);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    // No prune at root — we want to know the actual scores for tiebreaking,
    // and the depth-1 calls inside still benefit from pruning.
  }

  return bestMove;
}

/**
 * Minimax with alpha-beta pruning.
 * `maximizing` is true when the side to move is the CPU.
 */
function minimax(
  state: GameState,
  depth: number,
  alphaIn: number,
  betaIn: number,
  maximizing: boolean,
  config: GameConfig,
): number {
  let alpha = alphaIn;
  let beta = betaIn;

  if (depth === 0 || state.status !== 'active') {
    return evaluate(state, config);
  }

  const moves = legalMoves(state, config);
  if (moves.length === 0) {
    // The side to move has no moves — they lose. Apply terminal score
    // from the CPU's perspective.
    return state.turn === 'player' ? +TERMINAL_SCORE : -TERMINAL_SCORE;
  }

  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move, config);
      const score = minimax(next, depth - 1, alpha, beta, false, config);
      if (score > value) value = score;
      if (value > alpha) alpha = value;
      if (alpha >= beta) break;
    }
    return value;
  } else {
    let value = +Infinity;
    for (const move of moves) {
      const next = applyMove(state, move, config);
      const score = minimax(next, depth - 1, alpha, beta, true, config);
      if (score < value) value = score;
      if (value < beta) beta = value;
      if (beta <= alpha) break;
    }
    return value;
  }
}

/** For debug/UI use: total pieces on the board for each side. */
export function pieceCounts(board: Board): {
  player: number;
  cpu: number;
  playerKings: number;
  cpuKings: number;
} {
  let player = 0;
  let cpu = 0;
  let playerKings = 0;
  let cpuKings = 0;
  for (const pos of piecesOf(board, 'player')) {
    const cell = board[pos[0]]![pos[1]] as Piece;
    player++;
    if (cell.king) playerKings++;
  }
  for (const pos of piecesOf(board, 'cpu')) {
    const cell = board[pos[0]]![pos[1]] as Piece;
    cpu++;
    if (cell.king) cpuKings++;
  }
  return { player, cpu, playerKings, cpuKings };
}
