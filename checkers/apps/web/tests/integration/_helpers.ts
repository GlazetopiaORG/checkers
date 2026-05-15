/**
 * Shared helpers for integration tests against the local Supabase.
 */

import { createHmac } from 'node:crypto';

import { getSupabase } from '../../src/lib/supabase.js';

/** Wipes test data tables. Safe because local Supabase is ephemeral. */
export async function wipeDatabase(): Promise<void> {
  const supabase = getSupabase();
  // Order matters because of FK relationships.
  await supabase
    .from('checkers_marks')
    .delete()
    .gte('awarded_at', '1970-01-01');
  await supabase
    .from('checkers_moves')
    .delete()
    .gte('id', 0);
  await supabase
    .from('checkers_sessions')
    .delete()
    .gte('started_at', '1970-01-01');
  await supabase
    .from('users')
    .delete()
    .gte('created_at', '1970-01-01');
}

export function botSign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Skip an integration test gracefully when local DB is not reachable. */
export async function ensureDbReachable(): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('users').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
