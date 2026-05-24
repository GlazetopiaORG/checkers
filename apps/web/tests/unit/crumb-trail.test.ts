/**
 * Unit tests for the Crumb Trail content file.
 *
 * The safety tests are the important ones — they prevent future edits from
 * accidentally putting real puzzle answers, unlock codes, color reveals,
 * or wallet-related strings into client-side copy.
 *
 * If a test here fails, look at what was added to crumb-trail.ts most
 * recently — it probably tripped one of the patterns below.
 */

import { describe, expect, it } from 'vitest';

import {
  CRUMB_TRAIL_CONTENT,
  LORE_TERMS_ALLOWLIST,
  pickCrumbForSession,
  pickTipForSession,
} from '../../src/app/checkers/[sessionId]/_content/crumb-trail';
import { THEME_KEYS } from '../../src/app/checkers/[sessionId]/_lib/themes';

// ----------------------------------------------------------------------------
// Structural tests
// ----------------------------------------------------------------------------

describe('CRUMB_TRAIL_CONTENT structure', () => {
  it('has non-empty panel title and subtitle', () => {
    expect(CRUMB_TRAIL_CONTENT.header.panelTitle.length).toBeGreaterThan(0);
    expect(CRUMB_TRAIL_CONTENT.header.panelSubtitle.length).toBeGreaterThan(0);
  });

  it('has labels for every duel-status field', () => {
    const labels = CRUMB_TRAIL_CONTENT.duelLabels;
    expect(labels.turn).toBeTruthy();
    expect(labels.marks).toBeTruthy();
    expect(labels.capturesAvailable).toBeTruthy();
    expect(labels.moveCount).toBeTruthy();
    expect(labels.yourTurn).toBeTruthy();
    expect(labels.unbakedTurn).toBeTruthy();
    expect(labels.gameOver).toBeTruthy();
    expect(labels.capturesValue).toBeTruthy();
  });

  it('has a theme-lore line for every known theme', () => {
    for (const k of THEME_KEYS) {
      const line = CRUMB_TRAIL_CONTENT.themeLore[k];
      expect(line, `missing theme lore for ${k}`).toBeTruthy();
      expect(line.length).toBeGreaterThan(8);
    }
  });

  it('has at least one crumb and one tip', () => {
    expect(CRUMB_TRAIL_CONTENT.crumbs.length).toBeGreaterThan(0);
    expect(CRUMB_TRAIL_CONTENT.tips.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------------
// Deterministic pickers
// ----------------------------------------------------------------------------

describe('pickCrumbForSession / pickTipForSession', () => {
  it('returns the same crumb for the same session id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(pickCrumbForSession(id)).toBe(pickCrumbForSession(id));
  });

  it('returns the same tip for the same session id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(pickTipForSession(id)).toBe(pickTipForSession(id));
  });

  it('returns a string that came from the content arrays', () => {
    for (let i = 0; i < 50; i++) {
      const id = `session-${i}-${i * 7}`;
      const c = pickCrumbForSession(id);
      const t = pickTipForSession(id);
      expect(CRUMB_TRAIL_CONTENT.crumbs).toContain(c);
      expect(CRUMB_TRAIL_CONTENT.tips).toContain(t);
    }
  });

  it('distributes crumbs across the available pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pickCrumbForSession(`s-${i}-${i * 13}`));
    }
    // Should hit more than one crumb across 200 ids
    expect(seen.size).toBeGreaterThan(1);
  });
});

// ----------------------------------------------------------------------------
// SAFETY: forbidden patterns
//
// Every crumb and every tip must pass these scans. If you're seeing a
// failure here, the recent edit to crumb-trail.ts introduced something
// that looks like a puzzle answer or sensitive value.
// ----------------------------------------------------------------------------

const FORBIDDEN_SUBSTRINGS = [
  // Direct answer / credential markers
  'answer:',
  'password',
  'unlock code',
  'unlock:',
  // Color reveal markers
  'color:',
  'colour:',
  'rgb(',
  '#ff', // hex codes — overzealous on purpose
  // Wallet/token markers
  'wallet',
  'seed phrase',
  'private key',
  'mnemonic',
  '0x',
  // Generic "PIN" — case insensitive
  'pin code',
];

// Patterns matched case-INSENSITIVELY
const FORBIDDEN_REGEXES = [
  /\bpin\b/i,
  /\bcode\s*[:=]/i,        // "code:", "code =", "code   :"
  /\bcolou?r\s*[:=]/i,
  /\bsolution\s*[:=]/i,
];

function scanText(text: string, where: string): string[] {
  const issues: string[] = [];
  const lower = text.toLowerCase();

  for (const s of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(s.toLowerCase())) {
      issues.push(`${where}: contains forbidden substring "${s}"`);
    }
  }
  for (const re of FORBIDDEN_REGEXES) {
    if (re.test(text)) {
      issues.push(`${where}: matches forbidden pattern ${re}`);
    }
  }

  // ALL-CAPS run of 6+ chars that isn't a known lore term.
  // Catches strings like "SUGAR42" or "REDFOX99".
  const capsMatches = text.match(/\b[A-Z0-9]{6,}\b/g) ?? [];
  for (const word of capsMatches) {
    const stripped = word.replace(/[0-9]/g, '');
    if (LORE_TERMS_ALLOWLIST.includes(word) || LORE_TERMS_ALLOWLIST.includes(stripped)) {
      continue;
    }
    issues.push(`${where}: contains suspicious ALL-CAPS run "${word}" (not in LORE_TERMS_ALLOWLIST)`);
  }

  return issues;
}

describe('SAFETY scanner — forbidden patterns in client-shipped copy', () => {
  it('no crumb contains forbidden substrings or patterns', () => {
    const issues: string[] = [];
    CRUMB_TRAIL_CONTENT.crumbs.forEach((c, i) => {
      issues.push(...scanText(c, `crumbs[${i}] "${c}"`));
    });
    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('no tip contains forbidden substrings or patterns', () => {
    const issues: string[] = [];
    CRUMB_TRAIL_CONTENT.tips.forEach((t, i) => {
      issues.push(...scanText(t, `tips[${i}] "${t}"`));
    });
    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('no theme lore contains forbidden substrings or patterns', () => {
    const issues: string[] = [];
    for (const [k, line] of Object.entries(CRUMB_TRAIL_CONTENT.themeLore)) {
      issues.push(...scanText(line, `themeLore.${k}`));
    }
    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('no opponent lore contains forbidden substrings or patterns', () => {
    const issues: string[] = [];
    for (const [k, line] of Object.entries(CRUMB_TRAIL_CONTENT.opponentLore)) {
      issues.push(...scanText(line, `opponentLore.${k}`));
    }
    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('has an opponent lore line for both sheriff and unbaked', () => {
    expect(CRUMB_TRAIL_CONTENT.opponentLore.sheriff.length).toBeGreaterThan(8);
    expect(CRUMB_TRAIL_CONTENT.opponentLore.unbaked.length).toBeGreaterThan(8);
  });

  // Sanity: the scanner itself catches things we'd expect it to.
  it('scanner correctly flags an obvious test string', () => {
    const issues = scanText('the unlock code: SUGAR42', 'test');
    expect(issues.length).toBeGreaterThan(0);
  });

  it('scanner does NOT flag known lore terms', () => {
    const issues = scanText('GUARDIAN was not written for decoration.', 'test');
    expect(issues).toEqual([]);
  });
});
