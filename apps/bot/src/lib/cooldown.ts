/**
 * In-memory per-user cooldown tracker.
 *
 * This is a CHEAP guard against repeated /checkers spam — it does NOT replace
 * the backend's real cooldown (which is DB-backed and survives bot restarts).
 *
 * If the bot is restarted, the cooldown map resets. That's fine: the backend
 * cooldown is the authoritative one. We just want to avoid hammering the
 * backend with rapid-fire requests from the same user in the same session.
 */

interface CooldownEntry {
  /** Unix ms when the cooldown expires. */
  until: number;
}

export class CooldownTracker {
  private readonly windowMs: number;
  private readonly entries = new Map<string, CooldownEntry>();

  constructor(seconds: number) {
    this.windowMs = seconds * 1000;
  }

  /**
   * Check + mark in one call. Returns either `{ ok: true }` or
   * `{ ok: false, retryAfterSeconds }`.
   *
   * `key` should usually be a Discord user id, but it can be anything
   * the caller wants to scope on (e.g. user+command).
   */
  check(key: string, nowMs: number = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    if (this.windowMs === 0) {
      // Cooldown disabled.
      return { ok: true };
    }

    this.cleanupIfNeeded(nowMs);

    const existing = this.entries.get(key);
    if (existing && existing.until > nowMs) {
      const remainingMs = existing.until - nowMs;
      return { ok: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
    }

    this.entries.set(key, { until: nowMs + this.windowMs });
    return { ok: true };
  }

  /**
   * Periodically prune expired entries so the Map doesn't grow unbounded.
   * Called inline before each check; no separate timer needed.
   */
  private lastCleanup = 0;
  private cleanupIfNeeded(nowMs: number): void {
    // At most once per minute to avoid CPU thrash on busy guilds.
    if (nowMs - this.lastCleanup < 60_000) return;
    this.lastCleanup = nowMs;
    for (const [k, v] of this.entries) {
      if (v.until <= nowMs) this.entries.delete(k);
    }
  }

  /** For tests. */
  size(): number {
    return this.entries.size;
  }

  /** For tests / hot-reload. */
  clear(): void {
    this.entries.clear();
  }
}
