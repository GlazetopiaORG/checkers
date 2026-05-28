/**
 * Phase 4.6.4.1: per-path embed tests.
 *
 * The critical scenarios we MUST cover:
 *   - 2 Sheriff + 1 Unbaked → level NOT passed (combined sum is irrelevant)
 *   - Sheriff and Unbaked progress display separately
 *   - Each path shows its own threshold (5 for Sheriff, 3 for Unbaked)
 *   - The "Each path is independent — wins do not combine" line appears
 *   - Legacy combined "marks: N / required" view no longer exists
 */

// Phase 5.0.2: belt-and-braces env bootstrap. See README for rationale.
import '../_test-env';

import { describe, expect, it } from 'vitest';

import {
  cooldownEmbed,
  errorEmbed,
  infoEmbed,
  marksStatusEmbed,
  sessionStartedEmbed,
} from '../../src/lib/embeds';

// Helper: build a paths object with sensible defaults.
function mkPaths(opts: {
  sheriffMarks?: number;
  unbakedMarks?: number;
  sheriffRequired?: number;
  unbakedRequired?: number;
}) {
  const sheriffMarks = opts.sheriffMarks ?? 0;
  const unbakedMarks = opts.unbakedMarks ?? 0;
  const sheriffRequired = opts.sheriffRequired ?? 4;
  const unbakedRequired = opts.unbakedRequired ?? 2;
  return {
    sheriff: {
      marks: sheriffMarks,
      required: sheriffRequired,
      passed: sheriffMarks >= sheriffRequired,
    },
    unbaked: {
      marks: unbakedMarks,
      required: unbakedRequired,
      passed: unbakedMarks >= unbakedRequired,
    },
  };
}

// ---------------------------------------------------------------------------
// sessionStartedEmbed
// ---------------------------------------------------------------------------

describe('sessionStartedEmbed', () => {
  it('shows per-path progress, not a combined total', () => {
    const embed = sessionStartedEmbed({
      paths: mkPaths({ sheriffMarks: 1, unbakedMarks: 1 }),
      expiresAt: new Date('2026-05-15T20:00:00Z').toISOString(),
    });
    const json = embed.toJSON();
    expect(json.fields).toHaveLength(3);
    expect(json.fields![0]!.name).toBe("Sheriff's Trial");
    expect(json.fields![0]!.value).toContain('1 / 4 wins');
    expect(json.fields![1]!.name).toBe('Unbaked Duel');
    expect(json.fields![1]!.value).toContain('1 / 2 wins');
    expect(json.fields![2]!.name).toBe('Expires');
  });

  it('has the "wins do not combine" footer note', () => {
    const embed = sessionStartedEmbed({
      paths: mkPaths({}),
      expiresAt: new Date().toISOString(),
    });
    const json = embed.toJSON();
    expect(json.footer?.text).toContain('do not combine');
  });
});

// ---------------------------------------------------------------------------
// marksStatusEmbed — primary fix target for Phase 4.6.4.1, thresholds tuned
// in Phase 5.0.4 (Sheriff: 4, Unbaked: 2)
// ---------------------------------------------------------------------------

describe('marksStatusEmbed: per-path display', () => {
  it('shows Sheriff and Unbaked as separate fields', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 3, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();

    const fieldNames = json.fields!.map((f: { name: string; value: string; inline?: boolean }) => f.name);
    expect(fieldNames).toContain("Sheriff's Trial");
    expect(fieldNames).toContain('Unbaked Duel');

    const sheriffField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === "Sheriff's Trial")!;
    const unbakedField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Unbaked Duel')!;
    expect(sheriffField.value).toContain('3 / 4 wins');
    expect(unbakedField.value).toContain('1 / 2 wins');
  });

  it('REGRESSION: 3 Sheriff + 1 Unbaked does NOT pass', () => {
    // Spec for Phase 5.0.4: this MUST be 'No'. Sum is 4 but neither
    // single-path threshold (Sheriff 4, Unbaked 2) is reached.
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 3, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toBe('No');
  });

  it('REGRESSION: 3 Sheriff + 1 Unbaked still does NOT pass (sum = 4)', () => {
    // The sum 4 equals the Sheriff threshold but is NOT a passing condition.
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 3, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toBe('No');
  });

  it('passes when Sheriff alone reaches 4', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 4, unbakedMarks: 0 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toContain("Sheriff's Trial");
  });

  it('passes when Unbaked alone reaches 2', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 0, unbakedMarks: 2 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toContain('Unbaked Duel');
  });

  it('shows "both paths" when both thresholds reached', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 4, unbakedMarks: 2 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toContain('both');
  });

  it('always includes the "do not combine" footer', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 1, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    expect(json.footer?.text).toContain('do not combine');
  });

  it('shows "no duels yet" when both paths are zero', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 0, unbakedMarks: 0 }),
    });
    const json = embed.toJSON();
    expect(json.description?.toLowerCase()).toContain('no duels yet');
  });

  it('shows per-path "to go" copy when partial', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 1, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    // Sheriff: 4-1=3 to go. Unbaked: 2-1=1 to go.
    expect(json.description).toContain('Sheriff: 3 to go');
    expect(json.description).toContain('Unbaked: 1 to go');
  });

  it('shows wins (plural) in field values', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 0 }),
    });
    const json = embed.toJSON();
    const sheriffField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === "Sheriff's Trial")!;
    expect(sheriffField.value).toContain('wins');
  });

  it('does NOT render a combined "Marks" field or cross-path sum', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 3, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    // The legacy field name 'Marks' must not appear; only per-path names.
    const fieldNames = json.fields!.map((f: { name: string; value: string; inline?: boolean }) => f.name);
    expect(fieldNames).not.toContain('Marks');
    // And the description must never display the cross-path sum (3+1=4)
    // as if it were a combined total.
    expect(json.description ?? '').not.toMatch(/\b4\s*\/\s*4\b/);
  });
});

// ---------------------------------------------------------------------------
// Other embeds — unchanged carry-over
// ---------------------------------------------------------------------------

describe('cooldownEmbed', () => {
  it('includes retry seconds in the message', () => {
    const embed = cooldownEmbed({ retryAfterSeconds: 7 });
    const json = embed.toJSON();
    expect(json.description).toContain('7s');
  });
});

describe('errorEmbed and infoEmbed', () => {
  it('errorEmbed accepts a custom title', () => {
    const embed = errorEmbed({ title: 'Boom', message: 'It exploded' });
    const json = embed.toJSON();
    expect(json.title).toBe('Boom');
    expect(json.description).toBe('It exploded');
  });

  it('errorEmbed has a default title', () => {
    const embed = errorEmbed({ message: 'It exploded' });
    const json = embed.toJSON();
    expect(json.title).toBeDefined();
  });

  it('infoEmbed builds a neutral message', () => {
    const embed = infoEmbed({ title: 'FYI', message: 'A thing' });
    const json = embed.toJSON();
    expect(json.title).toBe('FYI');
    expect(json.description).toBe('A thing');
  });
});
