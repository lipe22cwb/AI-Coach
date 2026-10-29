-- This is a test BODY, not a standalone SQL script.
-- Use scripts/build-ranked-rollback-probe.mjs to assemble the guarded transaction.
-- A pre-existing staging auth user is required; this test creates no auth users.

-- 1. First-click safety, visible-board privacy, flags, and loss.
DO $first_loss$
DECLARE
  v_user uuid;
  v_match uuid;
  v_board jsonb;
  v_result jsonb;
  v_state public.ranked_match_state%ROWTYPE;
  v_mine integer;
  v_flag integer;
BEGIN
  SELECT id INTO STRICT v_user FROM auth.users LIMIT 1;
  IF has_function_privilege('anon', 'public.start_ranked_match(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reveal_ranked_cell(uuid,uuid,integer,integer)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.ranked_match_state', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ranked_match_state', 'SELECT')
     OR has_table_privilege('service_role', 'public.ranked_verified_results', 'INSERT')
  THEN RAISE EXCEPTION 'Ranked privileges are too broad'; END IF;

  v_match := public.start_ranked_match(v_user);
  v_result := public.reveal_first_ranked_cell(v_match, v_user, 0, 0);
  SELECT * INTO STRICT v_state FROM public.ranked_match_state WHERE match_id = v_match;
  IF cardinality(v_state.mine_positions) <> 40
     OR cardinality(v_state.revealed_positions) < 1
     OR NOT v_state.first_move_done
  THEN RAISE EXCEPTION 'First reveal failed'; END IF;
  IF EXISTS (
     SELECT 1 FROM unnest(v_state.mine_positions) AS m(pos)
     WHERE pos / 16 <= 1 AND pos % 16 <= 1
  ) THEN RAISE EXCEPTION 'First-click safe zone violated'; END IF;

  v_board := public.get_ranked_visible_board(v_match, v_user);
  IF v_board ? 'minePositions'
     OR (v_board ->> 'firstMoveDone')::boolean IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Active visible board leaked hidden mines'; END IF;

  SELECT x INTO v_flag FROM generate_series(0, 255) AS g(x)
  WHERE NOT x = ANY(v_state.revealed_positions)
    AND NOT x = ANY(v_state.mine_positions) LIMIT 1;
  IF v_flag IS NULL THEN RAISE EXCEPTION 'No hidden safe tile for flag test'; END IF;
  v_result := public.toggle_ranked_flag(v_match, v_user, v_flag / 16, v_flag % 16);
  IF (v_result ->> 'flagged')::boolean IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Flag action failed'; END IF;
  v_result := public.toggle_ranked_flag(v_match, v_user, v_flag / 16, v_flag % 16);
  IF (v_result ->> 'flagged')::boolean IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Unflag action failed'; END IF;

  v_mine := v_state.mine_positions[1];
  v_result := public.reveal_ranked_cell(v_match, v_user, v_mine / 16, v_mine % 16);
  IF v_result ->> 'status' <> 'lost' OR NOT (v_result ? 'minePositions')
  THEN RAISE EXCEPTION 'Mine hit did not finish as loss'; END IF;
  IF EXISTS (SELECT 1 FROM public.ranked_verified_results)
  THEN RAISE EXCEPTION 'A loss appeared in verified results'; END IF;
END $first_loss$;

-- 2. Successful real chord, loss, full-board legitimate win and official result.
DO $chord_and_win$
DECLARE
  v_user uuid;
  v_match uuid;
  v_center integer;
  v_mine integer;
  v_cell integer;
  v_result jsonb;
  v_flags integer[];
  v_state public.ranked_match_state%ROWTYPE;
  v_status text;
BEGIN
  SELECT id INTO STRICT v_user FROM auth.users LIMIT 1;
  v_match := public.start_ranked_match(v_user);
  v_result := public.reveal_first_ranked_cell(v_match, v_user, 8, 8);
  SELECT * INTO STRICT v_state FROM public.ranked_match_state WHERE match_id = v_match;
  SELECT p INTO v_center FROM unnest(v_state.revealed_positions) AS a(p)
    WHERE (SELECT count(*) FROM unnest(v_state.mine_positions) AS m(x)
      WHERE abs(x / 16 - p / 16) <= 1 AND abs(x % 16 - p % 16) <= 1) > 0
      AND EXISTS (SELECT 1 FROM generate_series(0, 255) AS g(x)
      WHERE abs(x / 16 - p / 16) <= 1 AND abs(x % 16 - p % 16) <= 1
        AND NOT x = ANY(v_state.revealed_positions)
        AND NOT x = ANY(v_state.mine_positions)) LIMIT 1;
  IF v_center IS NULL THEN RAISE EXCEPTION 'No candidate for legitimate chord'; END IF;

  FOR v_mine IN SELECT x FROM unnest(v_state.mine_positions) AS m(x)
    WHERE abs(x / 16 - v_center / 16) <= 1
      AND abs(x % 16 - v_center % 16) <= 1
  LOOP
    v_result := public.toggle_ranked_flag(v_match, v_user, v_mine / 16, v_mine % 16);
  END LOOP;
  v_result := public.chord_ranked_cell(v_match, v_user, v_center / 16, v_center % 16);
  IF v_result ->> 'status' NOT IN ('active', 'won')
     OR jsonb_array_length(v_result -> 'revealedCells') < 1
  THEN RAISE EXCEPTION 'Legitimate chord failed'; END IF;
  IF (SELECT count(*) FROM public.ranked_match_moves
      WHERE match_id = v_match AND action = 'chord') <> 1
  THEN RAISE EXCEPTION 'Chord missing from move history'; END IF;

  SELECT flagged_positions INTO v_flags FROM public.ranked_match_state WHERE match_id = v_match;
  SELECT x INTO v_mine FROM unnest(v_state.mine_positions) AS m(x)
    WHERE NOT x = ANY(v_flags) LIMIT 1;
  IF v_mine IS NULL THEN RAISE EXCEPTION 'No unflagged mine for chord-game loss'; END IF;
  v_result := public.reveal_ranked_cell(v_match, v_user, v_mine / 16, v_mine % 16);
  IF v_result ->> 'status' <> 'lost'
  THEN RAISE EXCEPTION 'Chord scenario did not finish with expected loss'; END IF;

  v_match := public.start_ranked_match(v_user);
  v_result := public.reveal_first_ranked_cell(v_match, v_user, 0, 0);
  FOR v_cell IN 0..255 LOOP
    SELECT * INTO STRICT v_state FROM public.ranked_match_state WHERE match_id = v_match;
    IF NOT v_cell = ANY(v_state.mine_positions)
       AND NOT v_cell = ANY(v_state.revealed_positions)
    THEN
      v_result := public.reveal_ranked_cell(v_match, v_user, v_cell / 16, v_cell % 16);
    END IF;
  END LOOP;
  SELECT status INTO STRICT v_status FROM public.ranked_matches WHERE id = v_match;
  IF v_status <> 'won' THEN RAISE EXCEPTION 'Legitimate full clear did not win'; END IF;
  IF (SELECT count(*) FROM public.ranked_verified_results WHERE match_id = v_match) <> 1
  THEN RAISE EXCEPTION 'Legitimate victory missing verified result'; END IF;
  IF (SELECT duration_ms FROM public.ranked_matches WHERE id = v_match)
       IS DISTINCT FROM
     (SELECT duration_ms FROM public.ranked_verified_results WHERE match_id = v_match)
  THEN RAISE EXCEPTION 'Official result duration does not match the server game'; END IF;
  IF (SELECT count(*) FROM public.ranked_verified_results) <> 1
  THEN RAISE EXCEPTION 'Loss/duplicate produced a verified result'; END IF;
END $chord_and_win$;

-- 3. Forged result, invalid coordinates and an incomplete chord are rejected.
DO $bad_actions$
DECLARE
  v_user uuid;
  v_match uuid;
  v_center integer;
  v_before integer;
  v_rejected boolean := false;
  v_result jsonb;
  v_state public.ranked_match_state%ROWTYPE;
BEGIN
  SELECT id INTO STRICT v_user FROM auth.users LIMIT 1;
  v_match := public.start_ranked_match(v_user);
  BEGIN
    UPDATE public.ranked_matches
    SET status = 'won', duration_ms = 1000, finished_at = clock_timestamp()
    WHERE id = v_match;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Ranked win duration does not match%'
       OR SQLERRM LIKE 'Invalid server-owned Ranked win timing%'
       OR SQLERRM LIKE 'Ranked victory is not supported%'
    THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Forged result accepted'; END IF;
  IF (SELECT status FROM public.ranked_matches WHERE id = v_match) <> 'active'
  THEN RAISE EXCEPTION 'Rejected forged result changed status'; END IF;

  v_rejected := false;
  BEGIN
    v_result := public.reveal_first_ranked_cell(v_match, v_user, -1, 0);
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'Invalid board position'
    THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid coordinate accepted'; END IF;

  v_result := public.reveal_first_ranked_cell(v_match, v_user, 8, 8);
  SELECT * INTO STRICT v_state FROM public.ranked_match_state WHERE match_id = v_match;
  SELECT p INTO v_center FROM unnest(v_state.revealed_positions) AS a(p)
  WHERE (SELECT count(*) FROM unnest(v_state.mine_positions) AS m(x)
    WHERE abs(x / 16 - p / 16) <= 1 AND abs(x % 16 - p % 16) <= 1) > 0 LIMIT 1;
  IF v_center IS NULL THEN RAISE EXCEPTION 'No numbered tile for negative chord'; END IF;
  SELECT move_count INTO v_before FROM public.ranked_matches WHERE id = v_match;
  v_rejected := false;
  BEGIN
    v_result := public.chord_ranked_cell(v_match, v_user, v_center / 16, v_center % 16);
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'Surrounding flag count does not match'
    THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Chord without flags accepted'; END IF;
  IF (SELECT move_count FROM public.ranked_matches WHERE id = v_match) <> v_before
  THEN RAISE EXCEPTION 'Rejected chord changed move history'; END IF;
  IF (SELECT count(*) FROM public.ranked_verified_results) <> 1
  THEN RAISE EXCEPTION 'Rejected actions altered verified results'; END IF;
END $bad_actions$;
