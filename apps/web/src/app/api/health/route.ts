/**
 * GET /api/health
 *
 * Liveness + DB connectivity check. Used by:
 *   - Vercel deployment health checks
 *   - Tests to confirm the server is ready before running integration tests
 *   - Manual debugging
 *
 * Does NOT leak environment info; just returns ok/error.
 */

import { NextResponse } from 'next/server';

import { getSupabase } from '@/lib/supabase';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = getSupabase();
    // Cheapest possible round-trip: read 1 row from users (empty result is fine).
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      return NextResponse.json(
        { ok: false, db: 'error', message: error.message },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, db: 'connected' }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: 'unknown',
        message: err instanceof Error ? err.message : 'unknown error',
      },
      { status: 503 },
    );
  }
}
