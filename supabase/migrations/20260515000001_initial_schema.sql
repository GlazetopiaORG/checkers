-- =============================================================================
-- Glazetopia Checkers — Initial Schema
-- =============================================================================
-- Tables:
--   users               One row per Discord user that has touched the game.
--   checkers_sessions   Authoritative game state, one row per game.
--   checkers_moves      Append-only audit log of every move played.
--   checkers_marks      One row per mark awarded; UNIQUE(session_id) prevents
--                       double-awarding from the same game.
--
-- All tables use uuid PKs (except moves, which uses bigserial because it's an
-- ordered append-only log and uuids are wasteful for that pattern).
-- =============================================================================

-- Enable required extensions.
create extension if not exists "uuid-ossp" with schema extensions;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default extensions.uuid_generate_v4(),
  discord_id text not null unique,
  discord_username text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.users is
  'One row per Discord user that has interacted with the game. Created on first /checkers invocation.';

create index if not exists users_discord_id_idx on public.users (discord_id);

-- -----------------------------------------------------------------------------
-- checkers_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.checkers_sessions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,

  -- Authentication: SHA-256 of the JWT issued to the player.
  -- We store the hash, not the JWT itself, so a DB leak doesn't yield valid tokens.
  token_hash text not null,

  -- Game state as a JSON blob matching the engine's GameState minus history
  -- (history is reconstructable from checkers_moves).
  board_state jsonb not null,
  turn text not null,
  status text not null,
  move_count integer not null default 0,
  moves_without_progress integer not null default 0,

  -- Lifecycle timestamps.
  started_at timestamptz not null default now(),
  last_move_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null,

  -- Loose anti-cheat: bind sessions to a hashed IP for drift detection.
  ip_hash text,

  -- Constraints.
  constraint checkers_sessions_turn_check
    check (turn in ('player', 'cpu')),
  constraint checkers_sessions_status_check
    check (status in ('pending', 'active', 'won', 'lost', 'draw', 'abandoned', 'expired'))
);

comment on table public.checkers_sessions is
  'Authoritative game state. Server-side only; never written from the browser.';

create index if not exists checkers_sessions_user_id_idx
  on public.checkers_sessions (user_id);

create index if not exists checkers_sessions_user_status_idx
  on public.checkers_sessions (user_id, status);

create index if not exists checkers_sessions_expires_at_idx
  on public.checkers_sessions (expires_at)
  where status in ('pending', 'active');

-- -----------------------------------------------------------------------------
-- checkers_moves
-- -----------------------------------------------------------------------------
create table if not exists public.checkers_moves (
  id bigserial primary key,
  session_id uuid not null references public.checkers_sessions(id) on delete cascade,
  move_index integer not null,
  actor text not null,
  from_sq jsonb not null,
  to_sq jsonb not null,
  captures jsonb not null default '[]'::jsonb,
  promoted boolean not null default false,
  board_after jsonb not null,
  created_at timestamptz not null default now(),

  constraint checkers_moves_actor_check
    check (actor in ('player', 'cpu')),
  constraint checkers_moves_session_index_unique
    unique (session_id, move_index)
);

comment on table public.checkers_moves is
  'Append-only audit log. Every move both sides make is recorded for replay/dispute.';

create index if not exists checkers_moves_session_id_idx
  on public.checkers_moves (session_id, move_index);

-- -----------------------------------------------------------------------------
-- checkers_marks
-- -----------------------------------------------------------------------------
create table if not exists public.checkers_marks (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null unique
    references public.checkers_sessions(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);

comment on table public.checkers_marks is
  'One row per mark awarded for winning a game. UNIQUE(session_id) prevents '
  'double-awarding. revoked_at supports soft-revoke without losing the audit trail.';

create index if not exists checkers_marks_user_id_idx
  on public.checkers_marks (user_id)
  where revoked_at is null;

-- -----------------------------------------------------------------------------
-- user_mark_counts (view)
-- -----------------------------------------------------------------------------
-- Convenience view for the bot/UI to ask "how many marks does this user have?"
-- without computing the aggregate every time.
create or replace view public.user_mark_counts as
select
  u.id              as user_id,
  u.discord_id      as discord_id,
  count(m.id)::int  as marks
from public.users u
left join public.checkers_marks m
  on m.user_id = u.id
  and m.revoked_at is null
group by u.id, u.discord_id;

comment on view public.user_mark_counts is
  'Live count of non-revoked marks per user. Used by the bot to gate role assignment.';
