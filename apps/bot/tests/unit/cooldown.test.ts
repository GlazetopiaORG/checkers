import { describe, expect, it } from 'vitest';

import { CooldownTracker } from '../../src/lib/cooldown';

describe('CooldownTracker', () => {
  it('allows the first call', () => {
    const cd = new CooldownTracker(5);
    const result = cd.check('user-1', 1_000_000);
    expect(result.ok).toBe(true);
  });

  it('rejects a second call within the window', () => {
    const cd = new CooldownTracker(5);
    cd.check('user-1', 1_000_000);
    const result = cd.check('user-1', 1_002_000); // 2s later
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSeconds).toBe(3);
    }
  });

  it('allows a call after the window expires', () => {
    const cd = new CooldownTracker(5);
    cd.check('user-1', 1_000_000);
    const result = cd.check('user-1', 1_006_000); // 6s later
    expect(result.ok).toBe(true);
  });

  it('scopes independently per key', () => {
    const cd = new CooldownTracker(5);
    cd.check('user-1', 1_000_000);
    const result = cd.check('user-2', 1_001_000);
    expect(result.ok).toBe(true);
  });

  it('is effectively disabled when constructed with 0', () => {
    const cd = new CooldownTracker(0);
    expect(cd.check('user-1', 1_000_000).ok).toBe(true);
    expect(cd.check('user-1', 1_000_001).ok).toBe(true);
    expect(cd.check('user-1', 1_000_002).ok).toBe(true);
  });

  it('rounds up retryAfterSeconds (no fractional seconds)', () => {
    const cd = new CooldownTracker(5);
    cd.check('user-1', 1_000_000);
    const result = cd.check('user-1', 1_000_500); // 0.5s into the window
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSeconds).toBe(5);
    }
  });

  it('clear() empties all tracked users', () => {
    const cd = new CooldownTracker(5);
    cd.check('user-1');
    cd.check('user-2');
    expect(cd.size()).toBe(2);
    cd.clear();
    expect(cd.size()).toBe(0);
  });
});
