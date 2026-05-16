/**
 * Self-play stress test: play a full game CPU vs CPU until it ends.
 * Catches endgame bugs the smoke test can't find.
 */
import {
  applyMove,
  cpuMove,
  initialState,
  legalMoves,
  makeConfig,
  pieceCounts,
} from '../packages/engine/src/index.js';

let state = initialState();
const config = makeConfig({ aiDepth: 2, drawAfterMovesWithoutProgress: 30 });

// Helper to use AI for both sides by temporarily swapping turn.
function chooseFor(side: 'player' | 'cpu') {
  if (state.turn === side) return cpuMove({ ...state, turn: 'cpu' as const }, config);
  return null;
}

console.log('Self-play (depth 2, draw at 30 stale moves)');
const t0 = Date.now();
let plyCount = 0;
while (state.status === 'active' && plyCount < 300) {
  // Use cpuMove for whoever's turn it is. cpuMove requires turn=cpu, so flip
  // temporarily for the player side and use the same picker.
  let move;
  if (state.turn === 'cpu') {
    move = cpuMove(state, config);
  } else {
    move = cpuMove({ ...state, turn: 'cpu' }, config);
    if (move) {
      // Re-validate the move is legal in the actual state (player's turn).
      const legals = legalMoves(state, config);
      const match = legals.find(
        (l) =>
          l.from[0] === move!.from[0] &&
          l.from[1] === move!.from[1] &&
          l.to[0] === move!.to[0] &&
          l.to[1] === move!.to[1],
      );
      move = match ?? legals[0] ?? null;
    }
  }
  if (!move) break;
  state = applyMove(state, move, config);
  plyCount++;
}
const dt = Date.now() - t0;

const counts = pieceCounts(state.board);
console.log(`  Ended after ${plyCount} plies in ${dt}ms`);
console.log(`  Status: ${state.status}`);
console.log(`  Final: player ${counts.player} (${counts.playerKings}K), cpu ${counts.cpu} (${counts.cpuKings}K)`);
console.log(`  Last move count without progress: ${state.movesWithoutProgress}`);

if (state.status === 'active') {
  console.log('  ! Game did not terminate within 300 plies');
  process.exit(1);
}
console.log('  ✓ Game terminated cleanly');
