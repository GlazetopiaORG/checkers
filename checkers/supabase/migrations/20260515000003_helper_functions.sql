-- =============================================================================
-- Helper functions and triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- expire_stale_sessions()
-- -----------------------------------------------------------------------------
-- Marks any pending/active session whose expires_at has passed as 'expired'.
-- Called opportunistically by the API before creating a new session. We don't
-- need cron for MVP; opportunistic cleanup is sufficient.
create or replace function public.expire_stale_sessions()
returns integer
language plpgsql
security definer
as $$
declare
  updated_count integer;
begin
  update public.checkers_sessions
     set status = 'expired',
         ended_at = now()
   where status in ('pending', 'active')
     and expires_at < now();
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

comment on function public.expire_stale_sessions() is
  'Marks past-expiry pending/active sessions as expired. Idempotent.';

-- -----------------------------------------------------------------------------
-- touch_user_last_seen()
-- -----------------------------------------------------------------------------
-- Sets users.last_seen_at = now() whenever the user starts a session.
-- Triggers fire automatically, so the API does not need to write this column.
create or replace function public.touch_user_last_seen()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.users
     set last_seen_at = now()
   where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_session_touches_user on public.checkers_sessions;
create trigger trg_session_touches_user
after insert on public.checkers_sessions
for each row
execute function public.touch_user_last_seen();

-- -----------------------------------------------------------------------------
-- count_user_marks(user_id)
-- -----------------------------------------------------------------------------
-- Returns the live non-revoked mark count for a user. Used by the API when
-- deciding whether the player has just crossed the threshold (e.g. 3 marks).
create or replace function public.count_user_marks(p_user_id uuid)
returns integer
language sql
stable
security definer
as $$
  select count(*)::int
    from public.checkers_marks
   where user_id = p_user_id
     and revoked_at is null;
$$;

comment on function public.count_user_marks(uuid) is
  'Returns the count of non-revoked marks for a user.';

-- -----------------------------------------------------------------------------
-- active_session_count(user_id)
-- -----------------------------------------------------------------------------
-- Returns how many active or pending sessions a user has. Used to enforce
-- the "one active session per user" rule at session creation.
create or replace function public.active_session_count(p_user_id uuid)
returns integer
language sql
stable
security definer
as $$
  select count(*)::int
    from public.checkers_sessions
   where user_id = p_user_id
     and status in ('pending', 'active')
     and expires_at >= now();
$$;

comment on function public.active_session_count(uuid) is
  'Returns the count of non-expired pending or active sessions for a user.';

-- -----------------------------------------------------------------------------
-- daily_session_count(user_id)
-- -----------------------------------------------------------------------------
-- Returns sessions started in the last 24h for the user. Used to enforce the
-- daily session cap.
create or replace function public.daily_session_count(p_user_id uuid)
returns integer
language sql
stable
security definer
as $$
  select count(*)::int
    from public.checkers_sessions
   where user_id = p_user_id
     and started_at >= now() - interval '24 hours';
$$;

comment on function public.daily_session_count(uuid) is
  'Returns the count of sessions started in the last 24 hours for a user.';
