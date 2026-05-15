/**
 * Root page. Phase 3 will replace this with a landing page that explains
 * the game is launched from Discord.
 */

export default function HomePage(): JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>Glazetopia Checkers</h1>
      <p>This game is launched from Discord. Run <code>/checkers</code> in the server.</p>
    </main>
  );
}
