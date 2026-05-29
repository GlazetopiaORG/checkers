/**
 * /checkers/[sessionId] — main game page.
 *
 * Server component. Pulls the session id from the URL path and the JWT
 * from the `?t=` query param, validates basic shape, and hands off to the
 * client component. The token isn't verified server-side here — the API
 * routes do that on every call. This page just passes it through.
 */

import { GameClient } from './_components/GameClient';

// Phase 5.0.8: server-side build stamp visible in Vercel function logs.
// eslint-disable-next-line no-console
console.log('[page/checkers/[sessionId]] LOADED — phase5.0.9');

interface PageProps {
  params: { sessionId: string };
  searchParams: { t?: string };
}

export default function CheckersPage({
  params,
  searchParams,
}: PageProps): JSX.Element {
  const sessionId = params.sessionId;
  const token = searchParams.t;

  if (!token) {
    return (
      <main className="game-shell">
        <header className="game-header">
          <h1 className="game-title">Glazetopia Checkers</h1>
        </header>
        <div className="state-message error" role="alert">
          <p>This duel link is missing its access token.</p>
          <p style={{ color: 'var(--ui-text-dim)', fontSize: '0.9em' }}>
            Return to Discord and run <code>/checkers</code> to get a fresh link.
          </p>
        </div>
      </main>
    );
  }

  if (!isValidSessionId(sessionId)) {
    return (
      <main className="game-shell">
        <header className="game-header">
          <h1 className="game-title">Glazetopia Checkers</h1>
        </header>
        <div className="state-message error" role="alert">
          <p>Invalid session id in URL.</p>
          <p style={{ color: 'var(--ui-text-dim)', fontSize: '0.9em' }}>
            Return to Discord and run <code>/checkers</code>.
          </p>
        </div>
      </main>
    );
  }

  // Phase 5: marksRequired is now opponent-derived by GameClient itself.
  // No env lookup needed here.

  return (
    <GameClient
      sessionId={sessionId}
      token={token}
    />
  );
}

/**
 * Light sanity check on the session id shape. The real verification happens
 * server-side when the JWT is checked against this id, but we reject
 * obvious garbage here to give a clearer error.
 */
function isValidSessionId(id: string): boolean {
  // UUID v4 form, lowercase.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}
