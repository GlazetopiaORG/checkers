# @glazetopia/bot

Discord bot for Glazetopia Checkers. Thin shim — does not touch Supabase, does not hold the JWT secret, does not assign roles (yet).

## What it does

| Command | Purpose |
| --- | --- |
| `/checkers` | Start a duel. Bot calls the backend to create a session, replies with an ephemeral embed + launch button. |
| `/checkers-status` | Show the user's current mark count. |

## Architecture

The bot is a thin shim between Discord and the checkers backend. It never:

- Talks to Supabase directly
- Signs or verifies JWTs
- Holds any DB credentials
- Decides who wins or grants marks

It only:

- Receives slash commands
- Calls the backend over HMAC-signed HTTPS
- Renders the response as Discord embeds

```
Discord ─── (gateway WS) ───  apps/bot
                                  │
                                  │ HMAC-SHA256 signed HTTPS
                                  ▼
                              apps/web (Vercel)  ────  Supabase
```

## Environment variables

| Variable | Required | Secret? | Notes |
| --- | --- | --- | --- |
| `DISCORD_BOT_TOKEN` | ✅ | ✅ | The bot's gateway auth. Reset via Developer Portal. |
| `DISCORD_APPLICATION_ID` | ✅ | ❌ | Public. From the Developer Portal. |
| `DISCORD_GUILD_ID` | ✅ | ❌ | The Glazetopia guild. Right-click → Copy Server ID. |
| `CHECKERS_BACKEND_URL` | ✅ | ❌ | Base URL of the deployed `apps/web` (e.g. `https://glazetopia-checkers.vercel.app`). |
| `CHECKERS_BOT_SHARED_SECRET` | ✅ | ✅ | HMAC secret. Must match the value set in the backend's env. |
| `BOT_COMMAND_COOLDOWN_SECONDS` | ❌ | ❌ | Per-user bot-side cooldown. Default 5. |
| `NODE_ENV` | ❌ | ❌ | `development` / `production`. |

What the bot does **NOT** receive:

- `SUPABASE_*` — bot never queries the DB
- `CHECKERS_JWT_SECRET` — only the backend signs session tokens

## Local setup

```bash
# 1. Make sure the backend is running on localhost:3000
npm run db:start
npm run web:dev

# 2. In another terminal, set the bot env (one-time)
cd apps/bot
cp ../../.env.example .env.local
# Edit .env.local with your bot token + matching shared secret

# 3. Register slash commands with Discord (one-time, or whenever commands change)
npm run bot:register

# 4. Run the bot
npm run bot:dev
```

## Production deployment (Railway)

1. Create a Railway project linked to your GitHub repo. Set the root directory to `apps/bot`.
2. Set the build command to `npm install && npm run build` (the root install resolves the workspace).
3. Set the start command to `node dist/index.js`.
4. Set env vars in Railway:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_GUILD_ID`
   - `CHECKERS_BACKEND_URL` (your production Vercel URL)
   - `CHECKERS_BOT_SHARED_SECRET` (must match Vercel)
   - `NODE_ENV=production`
5. Deploy.
6. After first successful deploy, register commands once:
   ```bash
   railway run -s glazetopia-bot npm run register-commands
   ```
   Or run `npm run bot:register` locally pointed at the production secrets.

## File layout

```
src/
├── index.ts                  ← Entry point: gateway login, interaction routing
├── env.ts                    ← zod-validated env loader
├── backend-client.ts         ← HMAC-signed calls to apps/web API
├── commands/
│   ├── index.ts              ← Command registry + dispatcher
│   ├── checkers.ts           ← /checkers handler
│   └── checkers-status.ts    ← /checkers-status handler
├── lib/
│   ├── embeds.ts             ← Embed builders (lore-flavored copy)
│   ├── cooldown.ts           ← In-memory per-user cooldown
│   └── errors.ts             ← Backend error → user message
└── scripts/
    └── register-commands.ts  ← One-time slash command registration
```

## Inviting the bot to a guild

You need the bot to be in the Glazetopia guild before slash commands work. Generate the invite URL:

```
https://discord.com/api/oauth2/authorize
  ?client_id=<DISCORD_APPLICATION_ID>
  &scope=bot+applications.commands
  &permissions=2147485696
```

Permissions integer `2147485696` = Send Messages (2048) + Embed Links (16384) + Use Slash Commands (2147483648). Manage Roles will be added in Phase 5.

After inviting, run `npm run bot:register` to push the commands to Discord. They should appear in the guild within a few seconds.

## Anti-cheat / safety

- Bot-side cooldown (default 5s) is a politeness layer, not a defense
- Backend cooldown (default 30s) is the real cooldown
- Bot has no Supabase access — even if compromised, the worst it can do is start sessions and check marks
- Bot has no `Manage Server` or other elevated permissions in MVP
- All bot replies are `ephemeral` so command output is private to the invoker
