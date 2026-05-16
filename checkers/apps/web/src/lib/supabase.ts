/**
 * Server-side Supabase client. Uses the service role key, which bypasses RLS.
 *
 * Only import this from server code (API routes, server actions, scripts).
 * Never import from React Client Components or any code that ships to the browser.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from './env.js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: 'public',
    },
  });
  return cached;
}

/** Reset the cache. ONLY for tests. */
export function _resetSupabaseForTests(): void {
  cached = null;
}
