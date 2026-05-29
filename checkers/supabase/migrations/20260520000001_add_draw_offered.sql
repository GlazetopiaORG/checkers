-- Phase 4.6.3: add draw_offered flag to checkers_sessions.
--
-- When the engine reports the no-progress threshold has been reached
-- (movesWithoutProgress >= drawAfterMovesWithoutProgress), the backend
-- now sets draw_offered = true instead of automatically ending the
-- session as 'draw'. The player can then choose:
--   - accept-draw  → status = 'draw', session ends, no mark awarded
--   - decline-draw → draw_offered = false, movesWithoutProgress = 0,
--                    play continues
--   - resign       → status = 'abandoned' (existing behavior)
--
-- Existing 'draw' sessions are left as-is — they were already terminal
-- under the old behavior and there's no reason to retroactively
-- "un-draw" them.

ALTER TABLE checkers_sessions
  ADD COLUMN draw_offered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN checkers_sessions.draw_offered IS
  'True when the no-progress threshold has been reached and the player has '
  'been offered the choice to Keep Playing / Accept Draw / Resign. The '
  'backend sets this; the client cannot directly modify it. See Phase 4.6.3.';
