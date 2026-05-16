import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../src/moves.js';
import { detectWinner } from '../src/winner.js';
import { makeState } from './_helpers.js';
describe('detectWinner', () => {
    it('returns active when both sides have moves', () => {
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 2, col: 3, side: 'cpu' },
        ], 'player');
        expect(detectWinner(state)).toBe('active');
    });
    it("returns 'won' (player wins) when CPU has no pieces", () => {
        // Player to move; CPU has no pieces. But detectWinner is called for
        // the side TO MOVE. So we set turn=cpu and CPU has no pieces → CPU
        // cannot move → CPU loses → status='won' from player's perspective.
        const state = makeState([{ row: 5, col: 2, side: 'player' }], 'cpu');
        expect(detectWinner(state)).toBe('won');
    });
    it("returns 'lost' when player has no legal moves", () => {
        // Player at (7,0), blocked by CPU at (6,1). Player has no other pieces.
        // Player to move; only forward-diagonal is (6,1) which is occupied by
        // CPU but not jumpable (would land at (5,2)... let's set up properly).
        // Player at (7,0). CPU at (6,1). Player can jump to (5,2) if empty.
        // To truly block, we need CPU at (6,1) AND player piece at (5,2) so the
        // jump landing is blocked.
        const state = makeState([
            { row: 7, col: 0, side: 'player' },
            { row: 6, col: 1, side: 'cpu' },
            { row: 5, col: 2, side: 'player' }, // blocks the jump landing
            { row: 4, col: 1, side: 'cpu' }, // blocks the other simple move from 5,2
            { row: 4, col: 3, side: 'cpu' }, // blocks the other simple move from 5,2
            { row: 3, col: 0, side: 'cpu' }, // blocks jump from 5,2 over 4,1 to 3,0
            { row: 3, col: 4, side: 'cpu' }, // blocks jump from 5,2 over 4,3 to 3,4
        ], 'player');
        // Confirm player has no legal moves
        expect(legalMoves(state)).toEqual([]);
        expect(detectWinner(state)).toBe('lost');
    });
    it("returns 'draw' after drawAfterMovesWithoutProgress moves", () => {
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 2, col: 3, side: 'cpu' },
        ], 'player', { movesWithoutProgress: 40 });
        expect(detectWinner(state)).toBe('draw');
    });
});
describe('end-to-end winner detection via applyMove', () => {
    it('sets status when the winning move ends the game', () => {
        // Player ready to capture CPU's last piece.
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 4, col: 3, side: 'cpu' }, // only CPU piece
        ], 'player');
        const move = legalMoves(state)[0];
        const next = applyMove(state, move);
        // After move, CPU has no pieces and it is CPU's turn → CPU loses → won.
        expect(next.status).toBe('won');
    });
});
//# sourceMappingURL=winner.test.js.map