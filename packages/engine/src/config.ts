/**
 * Configurable rule knobs. Every consumer of the engine can pass a custom
 * config; if omitted, `defaultConfig` is used. This is how we support
 * variant rules (e.g. forced maximum capture) and AI difficulty tuning
 * without touching the core engine code.
 */

export interface GameConfig {
  /**
   * 'any'     — any legal capture is allowed (standard American checkers).
   * 'maximum' — player must choose the capture chain that takes the most pieces.
   */
  readonly captureRule: 'any' | 'maximum';

  /**
   * If true, when a capture is available the player MUST take it
   * (simple slides become illegal). Standard rule = true.
   */
  readonly forcedCaptures: boolean;

  /**
   * If true, multi-jump chains are mandatory: once a jump lands on a
   * square from which another jump is available, the chain must continue.
   * Standard rule = true.
   */
  readonly multiJumpMandatory: boolean;

  /**
   * If true, kings move both forward and backward.
   * Standard rule = true. Variant 'misère' style sometimes uses false.
   */
  readonly kingMovesBothDirections: boolean;

  /**
   * Draw declared after this many moves without a capture or promotion.
   * Standard tournament rule is 40; lower values speed up draw detection.
   */
  readonly drawAfterMovesWithoutProgress: number;

  /**
   * Minimax search depth for the Unbaked AI.
   * 2 = trivial, 4 = challenging, 6 = punishing (and noticeably slower).
   */
  readonly aiDepth: number;

  /** Board size. Locked at 8 for MVP — do not change without engine work. */
  readonly boardSize: 8;
}

export const defaultConfig: GameConfig = {
  captureRule: 'any',
  forcedCaptures: true,
  multiJumpMandatory: true,
  kingMovesBothDirections: true,
  drawAfterMovesWithoutProgress: 40,
  aiDepth: 4,
  boardSize: 8,
};

/**
 * Convenience helper for tests and consumers that want to override
 * one or two settings without restating the whole object.
 */
export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...defaultConfig, ...overrides };
}
