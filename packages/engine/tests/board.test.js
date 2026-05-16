import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, cloneBoard, initialBoard, initialState, isDarkSquare, isInBounds, isInBoundsPos, piecesOf, samePosition, } from '../src/board.js';
describe('board basics', () => {
    it('isDarkSquare returns true only for odd (row+col)', () => {
        expect(isDarkSquare(0, 0)).toBe(false);
        expect(isDarkSquare(0, 1)).toBe(true);
        expect(isDarkSquare(1, 0)).toBe(true);
        expect(isDarkSquare(1, 1)).toBe(false);
        expect(isDarkSquare(7, 7)).toBe(false);
        expect(isDarkSquare(7, 6)).toBe(true);
    });
    it('isInBounds rejects negative and >=8', () => {
        expect(isInBounds(0, 0)).toBe(true);
        expect(isInBounds(7, 7)).toBe(true);
        expect(isInBounds(-1, 0)).toBe(false);
        expect(isInBounds(0, 8)).toBe(false);
        expect(isInBounds(8, 8)).toBe(false);
    });
    it('isInBoundsPos matches isInBounds', () => {
        expect(isInBoundsPos([3, 5])).toBe(true);
        expect(isInBoundsPos([-1, 5])).toBe(false);
    });
    it('samePosition compares both coords', () => {
        expect(samePosition([3, 4], [3, 4])).toBe(true);
        expect(samePosition([3, 4], [4, 3])).toBe(false);
    });
});
describe('initialBoard', () => {
    const board = initialBoard();
    it('is 8x8', () => {
        expect(board).toHaveLength(BOARD_SIZE);
        for (const row of board)
            expect(row).toHaveLength(BOARD_SIZE);
    });
    it('places 12 pieces per side', () => {
        let player = 0;
        let cpu = 0;
        for (const row of board) {
            for (const cell of row) {
                if (cell === null)
                    continue;
                if (cell.side === 'player')
                    player++;
                else
                    cpu++;
            }
        }
        expect(player).toBe(12);
        expect(cpu).toBe(12);
    });
    it('places all pieces on dark squares', () => {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = board[r][c];
                if (cell !== null) {
                    expect(isDarkSquare(r, c)).toBe(true);
                }
            }
        }
    });
    it('places CPU on rows 0-2 and player on rows 5-7', () => {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = board[r][c];
                if (cell === null)
                    continue;
                if (r <= 2)
                    expect(cell.side).toBe('cpu');
                if (r === 3 || r === 4)
                    throw new Error('middle rows must be empty');
                if (r >= 5)
                    expect(cell.side).toBe('player');
            }
        }
    });
    it('rows 3 and 4 are empty', () => {
        for (let c = 0; c < 8; c++) {
            expect(board[3][c]).toBeNull();
            expect(board[4][c]).toBeNull();
        }
    });
    it('starts no pieces as kings', () => {
        for (const row of board) {
            for (const cell of row) {
                if (cell !== null)
                    expect(cell.king).toBe(false);
            }
        }
    });
});
describe('initialState', () => {
    it('starts player to move on an active game', () => {
        const s = initialState();
        expect(s.turn).toBe('player');
        expect(s.status).toBe('active');
        expect(s.moveCount).toBe(0);
        expect(s.movesWithoutProgress).toBe(0);
        expect(s.lastMove).toBeNull();
        expect(s.history).toEqual([]);
    });
});
describe('cloneBoard', () => {
    it('produces an independent board', () => {
        const a = initialBoard();
        const b = cloneBoard(a);
        b[0][1] = null;
        // Original must remain intact.
        expect(a[0][1]).not.toBeNull();
    });
});
describe('piecesOf', () => {
    it('yields exactly 12 positions per side at start', () => {
        const board = initialBoard();
        const playerPositions = [...piecesOf(board, 'player')];
        const cpuPositions = [...piecesOf(board, 'cpu')];
        expect(playerPositions).toHaveLength(12);
        expect(cpuPositions).toHaveLength(12);
    });
});
//# sourceMappingURL=board.test.js.map