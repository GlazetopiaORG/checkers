/**
 * Test helpers. Not exported from the package; tests only.
 */
import { initialState } from '../src/board.js';
/** Build an empty 8x8 board. */
export function emptyBoard() {
    return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}
/** Build a board with exactly the listed pieces and nothing else. */
export function makeBoard(pieces) {
    const board = emptyBoard();
    for (const p of pieces) {
        const piece = { side: p.side, king: p.king ?? false };
        board[p.row][p.col] = piece;
    }
    return board;
}
/** Build a state with a specific board and turn. */
export function makeState(pieces, turn = 'player', overrides = {}) {
    return {
        board: makeBoard(pieces),
        turn,
        status: 'active',
        moveCount: 0,
        movesWithoutProgress: 0,
        lastMove: null,
        history: [],
        ...overrides,
    };
}
/** Quick fresh-start state for tests that don't need a custom board. */
export function freshState() {
    return initialState();
}
/** Position equality for assertions. */
export function pos(row, col) {
    return [row, col];
}
//# sourceMappingURL=_helpers.js.map