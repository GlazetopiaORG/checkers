# Glazetopia Checkers

A Discord-launched checkers mini-game where players battle the Unbaked. Three wins = level passed (granted via Discord role).

## Phase status

- ✅ **Phase 1** — Pure rules engine + AI (`packages/engine`)
- ✅ **Phase 2** — Backend API + Supabase (`apps/web`, `supabase/`)
- ⏳ **Phase 3** — Frontend (Next.js UI in the same `apps/web` app)
- ⏳ **Phase 4** — Discord bot (`apps/bot`)
- ⏳ **Phase 5** — Mark-triggered Discord role assignment
- ⏳ **Phase 6** — Anti-cheat monitoring & alerts

## Repo layout

```
checkers/
├── packages/
│   └── engine/                ← Pure rules engine + Unbaked AI (Phase 1)
├── apps/
│   └── web/                   ← Next.js app — API routes (Phase 2), UI (Phase 3 later)
├── supabase/
│   ├── config.toml            ← Supabase CLI configuration
│   └── migrations/            ← Versioned SQL migrations
├── scripts/                   ← Engine smoke/selfplay verification
└── .env.example               ← Placeholders for every env var across all phases
```

## Quick start

```bash
# Install
npm install

# Run engine tests
npm run engine:test

# Start local DB (requires Docker — Supabase CLI brings up Postgres + Studio)
npm run db:start
# Copy the URL/keys it prints into .env.local

# Run the API server
npm run web:dev

# Hit health check
curl http://localhost:3000/api/health
```

See `apps/web/README.md` for backend setup details and `apps/web/README.md#smoke-testing-the-api-by-hand` for manual API testing.

## Architectural principles

1. **Server-authoritative game state.** The browser is a renderer; only the backend declares wins, awards marks, or modifies the board. The engine runs server-side on every move.
2. **Defense in depth.** Anti-cheat is enforced at the engine layer (validation), service layer (rate limits, minimum moves), and DB layer (UNIQUE constraint on marks, RLS deny-all for anon).
3. **No keys in code.** Every secret lives in `.env.local` (local) or platform env vars (Railway/Vercel). The repo carries only `.env.example` with placeholders.
4. **Modular phases.** Each phase is independently deployable. Phase 5 can wire Discord roles without touching the engine; Phase 6 can add monitoring without changing the API contract.

## License

Private — Glazetopia.
