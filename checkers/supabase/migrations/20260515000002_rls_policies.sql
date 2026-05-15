-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Policy: gameplay tables are service-role only. The browser uses the anon
-- key, which has no policies granting access to these tables — every read
-- and write must go through our API routes, which use the service-role key.
--
-- This is intentional. The engine + API are the only trusted writers; the
-- client is a dumb renderer. RLS is our defense-in-depth so that even if
-- something accidentally exposes the anon key with elevated grants, the
-- tables remain locked.
-- =============================================================================

-- Enable RLS on every table. Without policies, this denies everything for
-- non-service-role connections.
alter table public.users               enable row level security;
alter table public.checkers_sessions   enable row level security;
alter table public.checkers_moves      enable row level security;
alter table public.checkers_marks      enable row level security;

-- The service role bypasses RLS automatically, so no policies are required
-- for it to function. We deliberately add NO policies for `anon` or
-- `authenticated` roles for these tables — the only way to read or write
-- is through our backend, which uses the service role.

-- If at some point the player UI needs to read their own history directly
-- from Supabase (rather than through the API), add a policy here scoped to
-- `auth.uid() = user_id`. Not needed in MVP.

-- Note: the user_mark_counts view inherits the security of its underlying
-- tables. Service-role queries work; anon queries return empty.
