/**
 * Smoke test — exercises the engine end-to-end without vitest.
 * Just confirms nothing throws and basic invariants hold.
 */
import { strict as assert } from 'node:assert';
import {
  applyMove,
  cpuMove,
  defaultConfig,
  initialState,
  legalMoves,
  makeConfig,
  pieceCounts,
} from '../packages/engine/src/index.js';
import { makeBoard } from '../packages/engine/tests/_helpers.js';

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

console.log('Smoke: initial state');
check('initialState has 12+12 pieces', () => {
  const s = initialState();
  const c = pieceCounts(s.board);
  assert.equal(c.player, 12);
  assert.equal(c.cpu, 12);
});

check('player has 7 opening moves', () => {
  const moves = legalMoves(initialState());
  assert.equal(moves.length, 7);
});

console.log('Smoke: simple move');
check('applyMove moves piece and flips turn', () => {
  const s = initialState();
  const m = legalMoves(s)[0]!;
  const n = applyMove(s, m);
  assert.equal(n.turn, 'cpu');
  assert.equal(n.moveCount, 1);
});

console.log('Smoke: single capture');
check('single capture removes captured piece', () => {
  const board = makeBoard([
    { row: 5, col: 2, side: 'player' },
    { row: 4, col: 3, side: 'cpu' },
  ]);
  const state = {
    board,
    turn: 'player' as const,
    status: 'active' as const,
    moveCount: 0,
    movesWithoutProgress: 0,
    lastMove: null,
    history: [],
  };
  const moves = legalMoves(state);
  assert.equal(moves.length, 1);
  assert.equal(moves[0]!.captures.length, 1);
  const next = applyMove(state, moves[0]!);
  assert.equal(next.board[4]![3], null);
  assert.equal(next.board[3]![4]!.side, 'player');
});

console.log('Smoke: double jump');
check('double jump found and applied correctly', () => {
  const board = makeBoard([
    { row: 5, col: 2, side: 'player' },
    { row: 4, col: 3, side: 'cpu' },
    { row: 2, col: 3, side: 'cpu' },
  ]);
  const state = {
    board,
    turn: 'player' as const,
    status: 'active' as const,
    moveCount: 0,
    movesWithoutProgress: 0,
    lastMove: null,
    history: [],
  };
  const moves = legalMoves(state);
  const doubles = moves.filter((m) => m.captures.length === 2);
  assert.equal(doubles.length, 1);
  assert.deepEqual(doubles[0]!.to, [1, 2]);
});

console.log('Smoke: promotion');
check('player man landing on row 0 is promoted', () => {
  const board = makeBoard([{ row: 1, col: 2, side: 'player' }]);
  const state = {
    board,
    turn: 'player' as const,
    status: 'active' as const,
    moveCount: 0,
    movesWithoutProgress: 0,
    lastMove: null,
    history: [],
  };
  const move = legalMoves(state).find((m) => m.to[0] === 0)!;
  assert.equal(move.promoted, true);
  const next = applyMove(state, move);
  assert.equal(next.board[0]![move.to[1]]!.king, true);
});

console.log('Smoke: AI');
check('cpuMove returns a legal move', () => {
  const s = initialState();
  const m = legalMoves(s)[0]!;
  const afterPlayer = applyMove(s, m);
  const cm = cpuMove(afterPlayer, makeConfig({ aiDepth: 2 }));
  assert.ok(cm);
  // confirm it appears in the legal set
  const legals = legalMoves(afterPlayer);
  const matched = legals.some(
    (l) =>
      l.from[0] === cm!.from[0] &&
      l.from[1] === cm!.from[1] &&
      l.to[0] === cm!.to[0] &&
      l.to[1] === cm!.to[1],
  );
  assert.ok(matched);
});

check('cpuMove takes obvious capture', () => {
  const board = makeBoard([
    { row: 3, col: 2, side: 'cpu' },
    { row: 4, col: 3, side: 'player' },
    { row: 7, col: 0, side: 'player' },
    { row: 7, col: 2, side: 'player' },
  ]);
  const state = {
    board,
    turn: 'cpu' as const,
    status: 'active' as const,
    moveCount: 0,
    movesWithoutProgress: 0,
    lastMove: null,
    history: [],
  };
  const cm = cpuMove(state, makeConfig({ aiDepth: 2 }));
  assert.ok(cm);
  assert.equal(cm!.captures.length, 1);
});

console.log('Smoke: full short game');
check('play 6 plies without errors', () => {
  let state = initialState();
  const config = makeConfig({ aiDepth: 2 });
  for (let i = 0; i < 6 && state.status === 'active'; i++) {
    if (state.turn === 'player') {
      state = applyMove(state, legalMoves(state, config)[0]!, config);
    } else {
      const m = cpuMove(state, config);
      assert.ok(m);
      state = applyMove(state, m!, config);
    }
  }
  assert.ok(state.moveCount >= 1);
});

console.log('Smoke: depth-4 AI runs in reasonable time');
check('depth=4 cpuMove completes in <3s', () => {
  const s = initialState();
  const playerMove = legalMoves(s)[0]!;
  const afterPlayer = applyMove(s, playerMove);
  const t0 = Date.now();
  const m = cpuMove(afterPlayer, defaultConfig); // depth 4
  const dt = Date.now() - t0;
  assert.ok(m);
  console.log(`    (depth 4 = ${dt}ms)`);
  assert.ok(dt < 3000, `too slow: ${dt}ms`);
});

console.log('');
console.log(`Passed: ${pass}  Failed: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
