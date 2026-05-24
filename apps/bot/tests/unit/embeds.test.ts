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
  const sheriffRequired = opts.sheriffRequired ?? 5;
  const unbakedRequired = opts.unbakedRequired ?? 3;
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
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 1 }),
      expiresAt: new Date('2026-05-15T20:00:00Z').toISOString(),
    });
    const json = embed.toJSON();
    expect(json.fields).toHaveLength(3);
    expect(json.fields![0]!.name).toBe("Sheriff's Trial");
    expect(json.fields![0]!.value).toContain('2 / 5 wins');
    expect(json.fields![1]!.name).toBe('Unbaked Duel');
    expect(json.fields![1]!.value).toContain('1 / 3 wins');
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
// marksStatusEmbed — the primary fix target for Phase 4.6.4.1
// ---------------------------------------------------------------------------

describe('marksStatusEmbed: per-path display', () => {
  it('shows Sheriff and Unbaked as separate fields', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();

    const fieldNames = json.fields!.map((f: { name: string; value: string; inline?: boolean }) => f.name);
    expect(fieldNames).toContain("Sheriff's Trial");
    expect(fieldNames).toContain('Unbaked Duel');

    const sheriffField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === "Sheriff's Trial")!;
    const unbakedField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Unbaked Duel')!;
    expect(sheriffField.value).toContain('2 / 5 wins');
    expect(unbakedField.value).toContain('1 / 3 wins');
  });

  it('REGRESSION: 2 Sheriff + 1 Unbaked does NOT pass', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    // Sum is 3 but neither threshold (5 sheriff, 3 unbaked) was reached
    // by either single path.
    expect(levelField.value).toBe('No');
  });

  it('REGRESSION: 4 Sheriff + 2 Unbaked still does NOT pass (sum = 6)', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 4, unbakedMarks: 2 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toBe('No');
  });

  it('passes when Sheriff alone reaches 5', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 5, unbakedMarks: 0 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toContain("Sheriff's Trial");
  });

  it('passes when Unbaked alone reaches 3', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 0, unbakedMarks: 3 }),
    });
    const json = embed.toJSON();
    const levelField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === 'Level Passed')!;
    expect(levelField.value).toContain('Unbaked Duel');
  });

  it('shows "both paths" when both thresholds reached', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 5, unbakedMarks: 3 }),
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
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    // Sheriff: 5-2=3 to go. Unbaked: 3-1=2 to go.
    expect(json.description).toContain('Sheriff: 3 to go');
    expect(json.description).toContain('Unbaked: 2 to go');
  });

  it('shows wins (plural) in field values', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 0 }),
    });
    const json = embed.toJSON();
    // Per-path display uses "wins" suffix
    const sheriffField = json.fields!.find((f: { name: string; value: string; inline?: boolean }) => f.name === "Sheriff's Trial")!;
    expect(sheriffField.value).toContain('wins');
  });

  it('does NOT render a combined "Marks: N / 3" field', () => {
    const embed = marksStatusEmbed({
      paths: mkPaths({ sheriffMarks: 2, unbakedMarks: 1 }),
    });
    const json = embed.toJSON();
    // The legacy field name 'Marks' must not appear; only per-path names.
    const fieldNames = json.fields!.map((f: { name: string; value: string; inline?: boolean }) => f.name);
    expect(fieldNames).not.toContain('Marks');
    // And the description must never say "3 / 3" (the cross-path sum).
    expect(json.description ?? '').not.toMatch(/3\s*\/\s*3/);
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
