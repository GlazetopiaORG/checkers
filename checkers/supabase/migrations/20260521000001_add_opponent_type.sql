-- Phase 4.6.4: opponent paths.
--
-- Adds opponent_type to checkers_sessions and checkers_marks so the
-- backend can track two independent progress paths per user:
--   - Sheriff Buttercream: 4 wins to pass (easier AI; tuned Phase 5.0.4)
--   - The Unbaked:         2 wins to pass (harder AI; tuned Phase 5.0.4)
--
-- Backend-authority guardrails:
--   - opponent_type on a session may only be set while status='pending'.
--     Once 'active', it is immutable (enforced in the service layer; the
--     DB allows updates so we can also use it for admin recovery).
--   - opponent_type on a mark is stamped at award time from the session
--     it came from; clients cannot directly write to checkers_marks.
--
-- Backfill strategy:
--   - Existing sessions and marks get opponent_type = 'unbaked' so the
--     prior 3-win-Unbaked behavior is preserved retroactively. This is
--     the conservative choice — no one is suddenly mid-way through a
--     Sheriff path they didn't choose.
--
-- Phase 5 readiness:
--   - The per-opponent mark count is computable as:
--       SELECT count(*) FROM checkers_marks
--        WHERE user_id = ? AND opponent_type = ? AND revoked_at IS NULL;
--   - The threshold lookup lives in apps/web/src/lib/opponents.ts —
--     sheriff = 5, unbaked = 3.

-- --- checkers_sessions ------------------------------------------------------

ALTER TABLE checkers_sessions
  ADD COLUMN opponent_type text;

UPDATE checkers_sessions
   SET opponent_type = 'unbaked'
 WHERE opponent_type IS NULL;

ALTER TABLE checkers_sessions
  ALTER COLUMN opponent_type SET NOT NULL,
  ALTER COLUMN opponent_type SET DEFAULT 'unbaked',
  ADD CONSTRAINT checkers_sessions_opponent_type_check
    CHECK (opponent_type IN ('sheriff', 'unbaked'));

COMMENT ON COLUMN checkers_sessions.opponent_type IS
  'Which opponent path this session is on. Set at session-commit time '
  '(when the player taps Open the Comic). Immutable once status=active.';

-- --- checkers_marks ---------------------------------------------------------

ALTER TABLE checkers_marks
  ADD COLUMN opponent_type text;

UPDATE checkers_marks
   SET opponent_type = 'unbaked'
 WHERE opponent_type IS NULL;

ALTER TABLE checkers_marks
  ALTER COLUMN opponent_type SET NOT NULL,
  ALTER COLUMN opponent_type SET DEFAULT 'unbaked',
  ADD CONSTRAINT checkers_marks_opponent_type_check
    CHECK (opponent_type IN ('sheriff', 'unbaked'));

CREATE INDEX IF NOT EXISTS checkers_marks_user_opp_idx
  ON checkers_marks (user_id, opponent_type)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN checkers_marks.opponent_type IS
  'Which path this mark counts toward. Stamped from the session row at '
  'award time. Marks from different opponent_types do not cross-credit.';

-- --- RPC: count_user_marks_by_opponent --------------------------------------
-- Phase 4.6.4: per-opponent mark count. The legacy count_user_marks
-- (which counts across all opponents) remains for backward compatibility
-- but the level-pass check now uses this filtered variant.
CREATE OR REPLACE FUNCTION public.count_user_marks_by_opponent(
  p_user_id uuid,
  p_opponent_type text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int
    FROM public.checkers_marks
   WHERE user_id = p_user_id
     AND opponent_type = p_opponent_type
     AND revoked_at IS NULL;
$$;

COMMENT ON FUNCTION public.count_user_marks_by_opponent(uuid, text) IS
  'Phase 4.6.4: returns non-revoked mark count for a user on a specific '
  'opponent path. Used by the level-pass threshold check.';
