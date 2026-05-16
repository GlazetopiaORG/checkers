import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../src/moves.js';
import { makeState } from './_helpers.js';
describe('single capture', () => {
    it('player jumps adjacent CPU piece', () => {
        // Player at (5,2), CPU at (4,3), land at (3,4) (empty).
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 4, col: 3, side: 'cpu' },
        ], 'player');
        const moves = legalMoves(state);
        expect(moves).toHaveLength(1);
        expect(moves[0].from).toEqual([5, 2]);
        expect(moves[0].to).toEqual([3, 4]);
        expect(moves[0].captures).toEqual([[4, 3]]);
    });
    it('forced-capture rule excludes simple slides when a capture exists', () => {
        // Capture available AND a simple slide also exists for another piece.
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 4, col: 3, side: 'cpu' },
            { row: 5, col: 6, side: 'player' },
        ], 'player');
        const moves = legalMoves(state);
        // Only the capture is legal.
        expect(moves).toHaveLength(1);
        expect(moves[0].captures).toHaveLength(1);
    });
    it('applies the capture: removes captured piece, moves attacker', () => {
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 4, col: 3, side: 'cpu' },
        ], 'player');
        const move = legalMoves(state)[0];
        const next = applyMove(state, move);
        expect(next.board[5][2]).toBeNull();
        expect(next.board[4][3]).toBeNull();
        expect(next.board[3][4]).toMatchObject({ side: 'player', king: false });
        expect(next.movesWithoutProgress).toBe(0); // capture resets the counter
    });
});
describe('multi-jump chains', () => {
    it('finds a double jump', () => {
        // Player at (5,2). CPU at (4,3) and (2,3). Land at (3,4), then (1,2).
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 4, col: 3, side: 'cpu' },
            { row: 2, col: 3, side: 'cpu' },
        ], 'player');
        const moves = legalMoves(state);
        // We expect at least one double-jump move.
        const doubles = moves.filter((m) => m.captures.length === 2);
        expect(doubles).toHaveLength(1);
        expect(doubles[0].to).toEqual([1, 2]);
        expect(doubles[0].captures).toEqual([
            [4, 3],
            [2, 3],
        ]);
        expect(doubles[0].steps).toEqual([
            [3, 4],
            [1, 2],
        ]);
        // It IS promoting on this jump (lands on row 1, not 0) — actually let's check.
        // Player man on row 1 has NOT reached row 0, so no promotion. Good.
        expect(doubles[0].promoted).toBe(false);
    });
    it('multi-jump terminates correctly when chain ends in king row', () => {
        // Player at (5,2). CPU at (4,3). Land at (3,4). CPU at (2,5). Land at (1,6).
        // CPU at (0,7) is not capturable (would land off-board).
        // So the chain should end at (1,6) since (1,6)→(0,7)→(-1,8) is OOB.
        // We're checking the chain ends and the move is correct.
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 4, col: 3, side: 'cpu' },
            { row: 2, col: 5, side: 'cpu' },
        ], 'player');
        const moves = legalMoves(state).filter((m) => m.captures.length === 2);
        expect(moves).toHaveLength(1);
        expect(moves[0].to).toEqual([1, 6]);
    });
    it('a man being kinged mid-chain stops the chain', () => {
        // Setup so a player man, after one capture, lands on row 0 (the king row).
        // Player at (2,3). CPU at (1,4). Land at (0,5) — king row.
        // CPU at (1,6) would offer (0,5)→(-,-)→OOB so chain naturally ends anyway.
        // Use a setup that WOULD continue if not for promotion stopping it:
        // Player at (2,3). CPU at (1,2). Land at (0,1). CPU at... row -1 → OOB.
        // To make this test meaningful we need promotion to land somewhere with
        // a further jump backwards. But a freshly-promoted KING could continue
        // backward, except the rule stops it.
        // Player at (2,5). CPU at (1,4). Player lands at (0,3) — promoted.
        // CPU at (1,2). If chain continued (as a king moving backward), it would
        // capture (1,2) and land at (2,1). But promotion stops the chain.
        const state = makeState([
            { row: 2, col: 5, side: 'player' },
            { row: 1, col: 4, side: 'cpu' },
            { row: 1, col: 2, side: 'cpu' },
        ], 'player');
        const moves = legalMoves(state);
        // Find the capture that ends at row 0.
        const promo = moves.find((m) => m.to[0] === 0 && m.captures.length === 1);
        expect(promo).toBeDefined();
        expect(promo.promoted).toBe(true);
        // There should NOT be a 2-capture chain through the king row.
        const longer = moves.find((m) => m.captures.length === 2);
        expect(longer).toBeUndefined();
    });
});
describe('promotion', () => {
    it('promotes a player man landing on row 0', () => {
        const state = makeState([{ row: 1, col: 2, side: 'player' }], 'player');
        const move = legalMoves(state).find((m) => m.to[0] === 0);
        expect(move.promoted).toBe(true);
        const next = applyMove(state, move);
        expect(next.board[0][move.to[1]]).toMatchObject({
            side: 'player',
            king: true,
        });
    });
    it('promotes a CPU man landing on row 7', () => {
        const state = makeState([{ row: 6, col: 1, side: 'cpu' }], 'cpu');
        const move = legalMoves(state).find((m) => m.to[0] === 7);
        expect(move.promoted).toBe(true);
        const next = applyMove(state, move);
        expect(next.board[7][move.to[1]]).toMatchObject({
            side: 'cpu',
            king: true,
        });
    });
    it('movesWithoutProgress resets on promotion', () => {
        const state = makeState([{ row: 1, col: 2, side: 'player' }], 'player', { movesWithoutProgress: 15 });
        const move = legalMoves(state).find((m) => m.to[0] === 0);
        const next = applyMove(state, move);
        expect(next.movesWithoutProgress).toBe(0);
    });
});
describe('kings', () => {
    it('a king can capture backward', () => {
        // King at (2,3). CPU at (3,4). Empty at (4,5). King captures backward
        // relative to a normal man (toward row 7).
        const state = makeState([
            { row: 2, col: 3, side: 'player', king: true },
            { row: 3, col: 4, side: 'cpu' },
        ], 'player');
        const moves = legalMoves(state);
        const cap = moves.find((m) => m.captures.length === 1);
        expect(cap).toBeDefined();
        expect(cap.to).toEqual([4, 5]);
    });
});
//# sourceMappingURL=rules.test.js.map