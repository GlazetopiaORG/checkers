# Glazetopia Checkers

A Discord-launched checkers mini-game where players battle the Unbaked. Three wins = level passed.

## Phase status

- ✅ **Phase 1** — Pure rules engine + AI (`packages/engine`)
- ✅ **Phase 2** — Backend API + Supabase (`apps/web`, `supabase/`)
- ✅ **Phase 3** — Frontend UI at `/checkers/[sessionId]` (`apps/web`)
- ✅ **Phase 4** — Discord bot (`apps/bot`)
- ✅ **Phase 4.5** — Bakery-themed UI polish, real character art (D'Lish + Unbaked), slower readable animations
- ✅ **Phase 4.6** — Comic-cover opening + 5 deterministic board themes (bakery, Glaze Gulch, Frosting, Unbaked, Comic)
- ✅ **Phase 4.6.1** — "The Crumb Trail" side panel (lore, duel status, mystery breadcrumbs)
- ✅ **Phase 4.6.2** — Unified game stage layout (page-lift reveal, board + panel inside one frame)
- ✅ **Phase 4.6.3** — Draw choice flow, character selection (6 heroes), regression fixes
- ✅ **Phase 4.6.4** — Opponent paths (Sheriff Buttercream — easier; The Unbaked — harder; thresholds tuned in Phase 5.0.4)
- ✅ **Phase 5.0.4** — Threshold tuning: Sheriff 5→4, Unbaked 3→2
- ✅ **Phase 4.6.4.1** — Discord status per-path display (removed combined-total view)
- ✅ **Phase 5** — Discord role assignment via bot HTTP endpoint; opponent-aware HUD
- ✅ **Phase 5.0.1** — Test bootstrap hardening: import-time env injection, role-service mock-overwrite bug fix, BOT_HTTP_PORT=0 (OS-assigned) allowed
- ✅ **Phase 5.0.2** — Per-test-file env pre-import guard for auth.test.ts and bot-client.test.ts
- ✅ **Phase 5.0.3** — Three-layer env bootstrap: vitest test.env (truly pre-import) + setupFiles + per-test guards, all reading from shared frozen defaults
- ⏳ **Phase 6** — Anti-cheat monitoring & alerts

## Repo layout

```
checkers/
├── packages/
│   └── engine/                ← Pure rules engine + Unbaked AI
├── apps/
│   ├── web/                   ← Next.js: frontend UI + API routes
│   └── bot/                   ← Discord bot — thin shim, no DB access
├── supabase/
│   ├── config.toml            ← Supabase CLI configuration
│   └── migrations/            ← Versioned SQL migrations
├── scripts/                   ← Engine verification scripts
└── .env.example               ← All env vars across all phases
```

## Quick start

```bash
# Install everything
npm install

# Start local Supabase (requires Docker)
npm run db:start
# Copy the printed URL/keys into apps/web/.env.local

# Start the backend
npm run web:dev
# Backend at http://localhost:3000

# Register Discord slash commands (one-time / on-change)
npm run bot:register

# Start the bot
npm run bot:dev
```

## Architecture

```
   ┌─────────┐    gateway    ┌────────────┐    HMAC HTTPS    ┌────────────┐
   │ Discord │ ─────────────▶│  apps/bot  │ ────────────────▶│  apps/web  │
   └─────────┘   ◀──────────  │ (Railway)  │ ◀────────────────│  (Vercel)  │
                              └────────────┘                  └─────┬──────┘
                                                                    │
                                                       service role │
                                                                    ▼
                                                            ┌──────────────┐
                                                            │   Supabase   │
                                                            └──────────────┘
```

The backend is the only component that touches Supabase. The bot is a thin shim. The browser is a renderer. The engine runs server-side.

## Principles

1. **Server-authoritative game state.** The browser is a renderer; only the backend declares wins and awards marks.
2. **Defense in depth.** Anti-cheat is enforced at the engine (validation), service (rate limits, min moves), DB (UNIQUE constraints), and bot (cooldowns) layers.
3. **Minimal secrets per component.** The bot doesn't know the JWT secret or Supabase keys. Each component has only what it needs.
4. **No keys in code.** Every secret lives in `.env.local` (local) or platform env vars (Railway/Vercel). The repo carries only `.env.example` with placeholders.
5. **Modular phases.** Each phase is independently deployable.

## Tests

```bash
npm run engine:test    # Rules engine
npm run web:test       # Backend + UI (integration tests skip without local DB)
npm run bot:test       # Bot (unit only — no Discord required)
```

## License

Private — Glazetopia.
