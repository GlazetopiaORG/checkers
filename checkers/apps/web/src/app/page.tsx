export default function HomePage(): JSX.Element {
  return (
    <main className="game-shell">
      <header className="game-header">
        <h1 className="game-title">Glazetopia Checkers</h1>
      </header>
      <div className="state-message">
        <p>This game is launched from Discord.</p>
        <p style={{ color: 'var(--ui-text-dim)' }}>
          Run <code>/checkers</code> in the Glazetopia server to start a duel
          with the Unbaked.
        </p>
      </div>
    </main>
  );
}
