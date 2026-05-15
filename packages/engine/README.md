# @glazetopia/engine

Pure TypeScript checkers rules engine and AI for Glazetopia Checkers. Zero runtime dependencies. Used by the backend (for server-side move validation) and contains the AI logic for the Unbaked opponent.

## Public API

```ts
import {
  // Construction
  initialState,
  initialBoard,
  // Move logic
  legalMoves,
  applyMove,
  movesEqual,
  // Game end
  detectWinner,
  hasAnyMove,
  // AI
  cpuMove,
  evaluate,
  pieceCounts,
  // Config
  defaultConfig,
  makeConfig,
  // Helpers
  isDarkSquare,
  isInBounds,
  samePosition,
  piecesOf,
  cloneBoard,
  BOARD_SIZE,
} from '@glazetopia/engine';

import type {
  GameState, GameConfig, Move, Board, Cell, Piece, Position, Side, GameStatus,
} from '@glazetopia/engine';
```

## Usage

```ts
// Start a game
let state = initialState();

// Get all legal moves for the current side to move
const moves = legalMoves(state);

// Apply one (throws on illegal input)
state = applyMove(state, moves[0]);

// Or restrict to moves from a specific piece (for UI piece-selection)
const fromOnePiece = legalMoves(state, defaultConfig, [5, 2]);

// Ask the Unbaked for its move when state.turn === 'cpu'
const cpu = cpuMove(state);
if (cpu) state = applyMove(state, cpu);

// Check status
if (state.status === 'won')  console.log('Player won!');
if (state.status === 'lost') console.log('The Unbaked feeds.');
```

## Configuration

All variant rules and AI difficulty live in `GameConfig`. Pass a custom config to any function, or use `defaultConfig`.

| Field                             | Default | Notes                                                          |
| --------------------------------- | ------- | -------------------------------------------------------------- |
| `captureRule`                     | `'any'` | `'maximum'` forces the longest available capture chain.        |
| `forcedCaptures`                  | `true`  | If true, you MUST take an available capture (standard rule).   |
| `multiJumpMandatory`              | `true`  | Chains must continue when another capture is available.        |
| `kingMovesBothDirections`         | `true`  | Standard. False = kings stuck moving forward only.             |
| `drawAfterMovesWithoutProgress`   | `40`    | Stalemate after this many moves with no capture or promotion.  |
| `aiDepth`                         | `4`     | Minimax search depth. 2=easy, 4=challenging, 6=punishing.      |
| `boardSize`                       | `8`     | Locked for MVP.                                                |

```ts
import { makeConfig, cpuMove } from '@glazetopia/engine';

const harder = makeConfig({ aiDepth: 6, captureRule: 'maximum' });
const move = cpuMove(state, harder);
```

## Design principles

1. **Pure functions, no mutation.** Every function takes state, returns new state. Safe for minimax recursion and for trivial undo.
2. **No runtime dependencies.** Runs in Node, browser, edge functions, or anywhere ES2022 is supported.
3. **Server-trustable.** The backend will use `legalMoves` + `applyMove` to validate every move client-side. Illegal moves throw rather than corrupt state.
4. **Deterministic AI.** `cpuMove` picks the first equally-best move so tests are stable. Wrap with randomization in production if you want less robotic play.

## Scripts

```bash
npm test            # Run all unit tests (vitest)
npm run test:watch  # Watch mode
npm run typecheck   # Type-only check
npm run build       # Compile to dist/
```

Two ad-hoc verification scripts live in `../../scripts/`:

```bash
tsx scripts/smoke.ts      # 10 fast end-to-end checks
tsx scripts/selfplay.ts   # Full self-play game (catches endgame bugs)
```
