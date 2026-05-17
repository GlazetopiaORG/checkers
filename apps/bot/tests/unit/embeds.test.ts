import { describe, expect, it } from 'vitest';

import {
  cooldownEmbed,
  errorEmbed,
  infoEmbed,
  marksStatusEmbed,
  sessionStartedEmbed,
} from '../../src/lib/embeds';

describe('sessionStartedEmbed', () => {
  it('builds an embed with marks and expiry fields', () => {
    const embed = sessionStartedEmbed({
      marks: 1,
      required: 3,
      expiresAt: new Date('2026-05-15T20:00:00Z').toISOString(),
    });
    const json = embed.toJSON();
    expect(json.color).toBeDefined();
    expect(json.title).toContain('Unbaked');
    expect(json.fields).toHaveLength(2);
    expect(json.fields![0]!.name).toBe('Marks');
    expect(json.fields![0]!.value).toContain('1');
    expect(json.fields![0]!.value).toContain('3');
    expect(json.fields![1]!.name).toBe('Expires');
    // Discord relative timestamp format
    expect(json.fields![1]!.value).toMatch(/^<t:\d+:R>$/);
  });
});

describe('marksStatusEmbed', () => {
  it('shows "level passed" copy when marks >= required', () => {
    const embed = marksStatusEmbed({ marks: 3, required: 3 });
    const json = embed.toJSON();
    expect(json.description?.toLowerCase()).toContain("hollow");
  });

  it('shows "no duels yet" when marks === 0', () => {
    const embed = marksStatusEmbed({ marks: 0, required: 3 });
    const json = embed.toJSON();
    expect(json.description?.toLowerCase()).toContain('no duels yet');
  });

  it('shows duels remaining when partial', () => {
    const embed = marksStatusEmbed({ marks: 1, required: 3 });
    const json = embed.toJSON();
    expect(json.description).toContain('2 more');
  });

  it('singular grammar for one duel left', () => {
    const embed = marksStatusEmbed({ marks: 2, required: 3 });
    const json = embed.toJSON();
    expect(json.description).toContain('1 more duel ');
  });
});

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
