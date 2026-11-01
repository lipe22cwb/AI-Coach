
-- Remove unnecessary permissions from authenticated users.
-- TRUNCATE bypasses Row Level Security (RLS).
-- REFERENCES and TRIGGER are not needed for Practice history.

REVOKE TRUNCATE, REFERENCES, TRIGGER
ON TABLE
    public.practice_games,
    public.practice_game_moves
FROM authenticated;
