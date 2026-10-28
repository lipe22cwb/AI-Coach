-- AI-Coach / Mindsweeper — Task 1: read-only Ranked database security audit.
-- Run in the Supabase SQL Editor for project squusumcekygqdkaabcm.
-- This script makes NO changes, returns NO secret keys and avoids user records.
-- Review every result set; false/missing checks need investigation.

-- 1. Confirm all six privileged gameplay functions and the result trigger
--    exist, and browser-facing roles cannot invoke the gameplay functions.
WITH expected(name, expected_args, expected_definer) AS (
  VALUES
    ('start_ranked_match', 'p_user_id uuid', false),
    ('get_ranked_visible_board', 'p_match_id uuid, p_user_id uuid', false),
    ('reveal_first_ranked_cell', 'p_match_id uuid, p_user_id uuid, p_row integer, p_column integer', false),
    ('reveal_ranked_cell', 'p_match_id uuid, p_user_id uuid, p_row integer, p_column integer', false),
    ('toggle_ranked_flag', 'p_match_id uuid, p_user_id uuid, p_row integer, p_column integer', false),
    ('chord_ranked_cell', 'p_match_id uuid, p_user_id uuid, p_row integer, p_column integer', false),
    ('record_verified_ranked_win', '', true)
)
SELECT e.name AS function_name,
       p.oid IS NOT NULL AS exists,
       CASE WHEN p.oid IS NULL THEN false ELSE pg_get_function_identity_arguments(p.oid) = e.expected_args END AS signature_matches,
       CASE WHEN p.oid IS NULL THEN false ELSE p.prosecdef = e.expected_definer END AS security_mode_matches,
       CASE WHEN p.oid IS NULL THEN false ELSE NOT has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_blocked,
       CASE WHEN p.oid IS NULL THEN false ELSE NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS signed_in_browser_blocked,
       CASE WHEN p.oid IS NULL THEN false ELSE has_function_privilege('service_role', p.oid, 'EXECUTE') END AS server_allowed
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = e.name
ORDER BY e.name;

-- 2. Check RLS and database grants. No public/anon/authenticated access
--    should exist on these Ranked tables. The service role must not be able
--    to directly INSERT or UPDATE official ranked_verified_results.
WITH expected(name) AS (
  VALUES ('ranked_matches'), ('ranked_match_state'),
         ('ranked_match_moves'), ('ranked_verified_results')
)
SELECT e.name AS table_name,
       c.oid IS NOT NULL AS exists,
       coalesce(c.relrowsecurity, false) AS rls_enabled,
       CASE WHEN c.oid IS NULL THEN false ELSE NOT (
         has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
       ) END AS browser_roles_blocked,
       CASE WHEN c.oid IS NULL THEN false ELSE has_table_privilege('service_role', c.oid, 'SELECT') END AS service_can_read,
       CASE WHEN c.oid IS NULL THEN false ELSE
         CASE WHEN e.name = 'ranked_verified_results'
           THEN NOT has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE')
           ELSE has_table_privilege('service_role', c.oid, 'INSERT,UPDATE')
         END
       END AS server_write_permissions_correct
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name AND c.relkind='r'
ORDER BY e.name;

-- 3. One active match per player, and an active-to-won results trigger.
SELECT EXISTS (
  SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND tablename='ranked_matches' AND indexname='ranked_one_active_match'
) AS one_active_match_index_exists,
EXISTS (
  SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='ranked_matches'
    AND t.tgname='capture_verified_ranked_win' AND NOT t.tgisinternal AND t.tgenabled='O'
) AS verified_win_trigger_enabled;

-- 4. Migrations installed in THIS database (version numbers only).
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('202610220001','202610280002') ORDER BY version;

-- 5. Aggregated data integrity. Results should be zero for the two
--    *_problems checks; these do not modify anyone's game.
SELECT (SELECT count(*) FROM public.ranked_matches) AS matches_total,
       (SELECT count(*) FROM public.ranked_match_moves) AS recorded_moves_total,
       (SELECT count(*) FROM public.ranked_verified_results) AS verified_wins_total,
       (SELECT count(*) FROM public.ranked_matches m
         JOIN public.ranked_match_state s ON s.match_id=m.id
         WHERE (s.first_move_done AND
           (s.mine_positions IS NULL OR cardinality(s.mine_positions) <> 40))
           OR (NOT s.first_move_done AND s.mine_positions IS NOT NULL)
           OR m.move_count < 0) AS inconsistent_board_problems,
       (SELECT count(*) FROM public.ranked_match_moves mm
         LEFT JOIN public.ranked_matches m ON m.id=mm.match_id
         WHERE m.id IS NULL) AS orphaned_move_problems;
