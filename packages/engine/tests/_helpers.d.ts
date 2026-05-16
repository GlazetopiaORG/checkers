/**
 * Test helpers. Not exported from the package; tests only.
 */
import type { Board, Cell, GameState, Position, Side } from '../src/types.js';
export interface PieceSpec {
    row: number;
    col: number;
    side: Side;
    king?: boolean;
}
/** Build an empty 8x8 board. */
export declare function emptyBoard(): Cell[][];
/** Build a board with exactly the listed pieces and nothing else. */
export declare function makeBoard(pieces: PieceSpec[]): Board;
/** Build a state with a specific board and turn. */
export declare function makeState(pieces: PieceSpec[], turn?: Side, overrides?: Partial<GameState>): GameState;
/** Quick fresh-start state for tests that don't need a custom board. */
export declare function freshState(): GameState;
/** Position equality for assertions. */
export declare function pos(row: number, col: number): Position;
//# sourceMappingURL=_helpers.d.ts.map