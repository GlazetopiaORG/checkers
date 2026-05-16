import { describe, expect, it } from 'vitest';
import { initialState } from '../src/board.js';
import { cpuMove, evaluate, pieceCounts } from '../src/ai.js';
import { makeConfig } from '../src/config.js';
import { applyMove, legalMoves } from '../src/moves.js';
import { makeState } from './_helpers.js';
describe('cpuMove', () => {
    it('returns null when game is not active', () => {
        const state = makeState([{ row: 0, col: 1, side: 'cpu' }], 'cpu', { status: 'won' });
        expect(cpuMove(state)).toBeNull();
    });
    it("throws when it is not the CPU's turn", () => {
        const state = initialState(); // player's turn
        expect(() => cpuMove(state)).toThrow(/not the CPU/i);
    });
    it('returns a legal move for the CPU', () => {
        // After player makes any opening move, it's CPU's turn.
        const playerState = initialState();
        const playerMove = legalMoves(playerState)[0];
        const cpuState = applyMove(playerState, playerMove);
        const move = cpuMove(cpuState, makeConfig({ aiDepth: 2 }));
        expect(move).not.toBeNull();
        // Verify the returned move is in the legal-move set.
        const legals = legalMoves(cpuState);
        const isLegal = legals.some((m) => m.from[0] === move.from[0] &&
            m.from[1] === move.from[1] &&
            m.to[0] === move.to[0] &&
            m.to[1] === move.to[1]);
        expect(isLegal).toBe(true);
    });
    it('takes an obvious capture when offered', () => {
        // CPU at (3,2). Player at (4,3). CPU should jump to (5,4).
        const state = makeState([
            { row: 3, col: 2, side: 'cpu' },
            { row: 4, col: 3, side: 'player' },
            // Add filler player pieces so the game has options to evaluate.
            { row: 7, col: 0, side: 'player' },
            { row: 7, col: 2, side: 'player' },
        ], 'cpu');
        const move = cpuMove(state, makeConfig({ aiDepth: 2 }));
        expect(move).not.toBeNull();
        expect(move.captures).toHaveLength(1);
        expect(move.to).toEqual([5, 4]);
    });
    it('plays a full short game without crashing', () => {
        // Plays out 6 plies from initial state with depth=2 to ensure stability.
        let state = initialState();
        const config = makeConfig({ aiDepth: 2 });
        for (let i = 0; i < 6 && state.status === 'active'; i++) {
            if (state.turn === 'player') {
                const m = legalMoves(state, config)[0];
                state = applyMove(state, m, config);
            }
            else {
                const m = cpuMove(state, config);
                expect(m).not.toBeNull();
                state = applyMove(state, m, config);
            }
        }
        expect(state.moveCount).toBeGreaterThan(0);
    });
});
describe('evaluate', () => {
    it('rates a CPU-favored material balance as positive', () => {
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 2, col: 3, side: 'cpu' },
            { row: 2, col: 5, side: 'cpu' },
            { row: 2, col: 7, side: 'cpu' },
        ], 'player');
        expect(evaluate(state)).toBeGreaterThan(0);
    });
    it('rates a player-favored material balance as negative', () => {
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 5, col: 4, side: 'player' },
            { row: 5, col: 6, side: 'player' },
            { row: 2, col: 3, side: 'cpu' },
        ], 'player');
        expect(evaluate(state)).toBeLessThan(0);
    });
    it('returns 0 for a draw', () => {
        const state = makeState([
            { row: 5, col: 2, side: 'player' },
            { row: 2, col: 3, side: 'cpu' },
        ], 'player', { status: 'draw' });
        expect(evaluate(state)).toBe(0);
    });
});
describe('pieceCounts', () => {
    it('counts initial position correctly', () => {
        const counts = pieceCounts(initialState().board);
        expect(counts.player).toBe(12);
        expect(counts.cpu).toBe(12);
        expect(counts.playerKings).toBe(0);
        expect(counts.cpuKings).toBe(0);
    });
});
//# sourceMappingURL=ai.test.js.map