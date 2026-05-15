# Glazetopia Checkers

A Discord-launched checkers mini-game where players battle the Unbaked. Three wins = level passed (granted via Discord role).

## Status

**Phase 1: Rules Engine** — ✅ Complete
**Phase 2: Backend API + Supabase** — pending
**Phase 3: Frontend (Next.js)** — pending
**Phase 4: Discord Bot** — pending
**Phase 5: Marks & role assignment** — pending
**Phase 6: Anti-cheat hardening** — pending

## Repo layout

```
checkers/
├── packages/
│   └── engine/          ← Phase 1: pure rules engine (this phase)
├── apps/
│   ├── web/             ← Phase 3: Next.js game frontend + API (later)
│   └── bot/             ← Phase 4: Discord bot (later)
└── .env.example         ← All env vars used across phases
```

## Setup

```bash
npm install
npm test          # Run engine tests
npm run build     # Build all packages
```

## Engine package

The rules engine is a pure TypeScript library with zero runtime dependencies. It is used by:

- The backend API (Phase 2) to validate every move server-side
- The Unbaked AI (also Phase 1) to choose CPU moves
- Future tooling (replays, debugging)

It is intentionally **not** used by the frontend in MVP — the browser asks the server for legal moves rather than computing them locally. This keeps anti-cheat tight.

See `packages/engine/README.md` for the public API.

## License

Private — Glazetopia.
