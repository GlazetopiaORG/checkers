# @glazetopia/web

Next.js app for Glazetopia Checkers. Phase 2 builds the API routes and Supabase integration. Phase 3 will add the UI to this same package.

## Architecture

API routes under `/api/checkers/`:

| Route                                       | Method | Auth          | Purpose                                          |
| ------------------------------------------- | ------ | ------------- | ------------------------------------------------ |
| `/api/checkers/session/start`               | POST   | Bot HMAC      | Create a new session for a Discord user          |
| `/api/checkers/session/:id`                 | GET    | Session JWT   | Load current state                               |
| `/api/checkers/session/:id/legal-moves`     | GET    | Session JWT   | Legal moves (optionally for one piece)           |
| `/api/checkers/session/:id/move`            | POST   | Session JWT   | Submit a player move, receive CPU reply         |
| `/api/checkers/session/:id/resign`          | POST   | Session JWT   | Concede the game                                 |
| `/api/health`                               | GET    | none          | Liveness check                                   |

Two trust zones:

- **Bot HMAC** — `/session/start` only. Body is signed with `CHECKERS_BOT_SHARED_SECRET` via HMAC-SHA256, sent in `x-checkers-signature`. The bot is the only party that knows this secret.
- **Session JWT** — every other route. The token is issued at session creation, bound to (sessionId, userId), and expires in `CHECKERS_SESSION_TTL_MINUTES` (default 15). Passed via `Authorization: Bearer ...` or `?t=...`.

## Local setup

```bash
# 1. Install
npm install

# 2. Start local Supabase (requires Docker)
npm run db:start
# This prints the local URL and anon/service keys. Copy them into .env.local.

# 3. Create your local env
cp .env.example .env.local
# Edit .env.local — paste keys from `db:start` and generate JWT/bot secrets.

# 4. Run migrations (db:start applies them automatically; this re-runs)
npm run db:reset

# 5. Start the dev server
npm run web:dev
```

The app runs at `http://localhost:3000`. Health check at `http://localhost:3000/api/health`.

## Tests

```bash
# Unit tests (no DB required)
npm run web:test -- tests/unit

# Integration tests (require local Supabase running)
npm run web:test -- tests/integration

# All
npm run web:test
```

Integration tests use `it.skipIf(!dbAvailable)` so they're skipped gracefully if the DB isn't up. They share a single fork (vitest singleFork) and wipe data between tests, so don't run them against a database that has data you care about.

## Smoke testing the API by hand

Once the server is running:

```bash
# Generate a bot signature (substitute your bot secret)
BODY='{"discordId":"123456789012345678","discordUsername":"tester"}'
SIG=$(node -e "console.log(require('crypto').createHmac('sha256', process.env.CHECKERS_BOT_SHARED_SECRET).update(process.argv[1]).digest('hex'))" "$BODY")

# Create a session
curl -X POST http://localhost:3000/api/checkers/session/start \
  -H "Content-Type: application/json" \
  -H "x-checkers-signature: $SIG" \
  -d "$BODY"

# Use the returned token to load the session
curl http://localhost:3000/api/checkers/session/$SESSION_ID -H "Authorization: Bearer $TOKEN"

# Get legal moves
curl "http://localhost:3000/api/checkers/session/$SESSION_ID/legal-moves" -H "Authorization: Bearer $TOKEN"

# Submit a move
curl -X POST http://localhost:3000/api/checkers/session/$SESSION_ID/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from":[5,2],"to":[4,3],"captures":[]}'
```

## What lives where

```
src/
├── app/
│   ├── layout.tsx                ← Root layout (placeholder, replaced in Phase 3)
│   ├── page.tsx                  ← Root page (placeholder)
│   └── api/
│       ├── health/route.ts
│       └── checkers/session/
│           ├── start/route.ts            POST  (bot only)
│           ├── [id]/route.ts             GET   (session JWT)
│           ├── [id]/legal-moves/route.ts GET
│           ├── [id]/move/route.ts        POST
│           └── [id]/resign/route.ts      POST
└── lib/
    ├── env.ts                    zod-validated env loader
    ├── supabase.ts               service-role Supabase client
    ├── jwt.ts                    JWT sign/verify + token hashing
    ├── auth.ts                   bot HMAC + session JWT middleware
    ├── errors.ts                 typed ApiError + handler
    ├── serialize.ts              GameState <-> DB JSON
    └── checkers-service.ts       all game logic — the heart of Phase 2
```

## Anti-cheat in Phase 2

- Server-authoritative state; the browser never declares a win
- Engine validates every move; illegal moves return 400
- JWT TTL 15 min, single session-id binding, token-hash stored on the row
- `UNIQUE(session_id)` on `checkers_marks` — DB-level idempotency
- Minimum move count for win (`CHECKERS_MIN_MOVES_FOR_WIN`, default 10)
- One active session per user
- Daily cap (`CHECKERS_MAX_DAILY_SESSIONS`, default 20)
- Cooldown between sessions (`CHECKERS_COOLDOWN_SECONDS`, default 30s)
- Full audit log of every move in `checkers_moves`
- RLS denies all anon access to gameplay tables — only the service role can read/write
