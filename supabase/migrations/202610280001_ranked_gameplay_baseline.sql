-- AI-Coach / Mindsweeper: Ranked gameplay schema baseline.
-- Source: the connected Mindsweeper Supabase database, audited October 28, 2026.
-- This migration represents previously manually-created objects; it introduces
-- NO new gameplay behavior and does NOT copy player data.
--
-- Order matters:
--   202610220001 account preferences (already in repo)
--   202610280001 THIS ranked gameplay baseline
--   202610280002 secure verified Ranked results (already in repo)
--
-- IMPORTANT: This is a bootstrap migration for a FRESH database only.
-- The live database already has these tables/functions and the later migration
-- marked applied. Do not run this file against that live database.
-- On the EXISTING linked project, verify the live objects first, then have the
-- project maintainer reconcile migration HISTORY with `supabase migration repair`
-- (see docs/RANKED-GAMEPLAY-BASELINE.md). Migration repair only updates tracking;
-- it does not create, overwrite, or update the tables.

begin;

-- Fail closed instead of silently overwriting a populated database.
do $baseline_guard$
begin
  if to_regclass('public.ranked_matches') is not null
     or to_regclass('public.ranked_match_state') is not null
     or to_regclass('public.ranked_match_moves') is not null
     or to_regclass('public.ranked_verified_results') is not null
     or to_regprocedure('public.start_ranked_match(uuid)') is not null
     or to_regprocedure('public.get_ranked_visible_board(uuid,uuid)') is not null
  then
    raise exception 'Ranked gameplay schema already exists. Do not apply baseline to an existing database; review docs/RANKED-GAMEPLAY-BASELINE.md and reconcile migration history.';
  end if;
end;
$baseline_guard$;

-- Intermediate Ranked board: always 16 x 16 with 40 mines.
create table public.ranked_matches (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'active'::text,
  rows integer not null default 16,
  columns integer not null default 16,
  mine_count integer not null default 40,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms bigint,
  move_count integer not null default 0,
  constraint ranked_matches_pkey primary key (id),
  constraint ranked_matches_user_id_fkey foreign key (user_id)
    references auth.users (id) on delete cascade,
  constraint ranked_matches_status_check check
    (status in ('active', 'won', 'lost', 'abandoned')),
  constraint ranked_matches_rows_check check (rows = 16),
  constraint ranked_matches_columns_check check (columns = 16),
  constraint ranked_matches_mine_count_check check (mine_count = 40),
  constraint ranked_matches_duration_ms_check check (duration_ms >= 0),
  constraint ranked_matches_move_count_check check (move_count >= 0)
);

-- A player can only have one active Ranked match at a time.
create unique index ranked_one_active_match
  on public.ranked_matches (user_id) where status = 'active';

create table public.ranked_match_state (
  match_id uuid not null,
  mine_positions integer[],
  revealed_positions integer[] not null default '{}'::integer[],
  flagged_positions integer[] not null default '{}'::integer[],
  first_move_done boolean not null default false,
  constraint ranked_match_state_pkey primary key (match_id),
  constraint ranked_match_state_match_id_fkey foreign key (match_id)
    references public.ranked_matches (id) on delete cascade,
  constraint ranked_match_state_mine_positions_check check
    (mine_positions is null or cardinality(mine_positions) = 40)
);

create table public.ranked_match_moves (
  match_id uuid not null,
  move_number integer not null,
  action text not null,
  row_index integer not null,
  column_index integer not null,
  received_at timestamptz not null default now(),
  constraint ranked_match_moves_pkey primary key (match_id, move_number),
  constraint ranked_match_moves_match_id_fkey foreign key (match_id)
    references public.ranked_matches (id) on delete cascade,
  constraint ranked_match_moves_action_check check
    (action in ('reveal', 'flag', 'unflag', 'chord')),
  constraint ranked_match_moves_move_number_check check (move_number > 0),
  constraint ranked_match_moves_row_index_check check
    (row_index >= 0 and row_index <= 15),
  constraint ranked_match_moves_column_index_check check
    (column_index >= 0 and column_index <= 15)
);

-- These tables are accessed only by trusted server-side Ranked endpoints.
-- The browser must not read hidden mine layouts or write Ranked game state.
alter table public.ranked_matches enable row level security;
alter table public.ranked_match_state enable row level security;
alter table public.ranked_match_moves enable row level security;

revoke all on table public.ranked_matches from public, anon, authenticated;
revoke all on table public.ranked_match_state from public, anon, authenticated;
revoke all on table public.ranked_match_moves from public, anon, authenticated;

grant select, insert, update, delete on public.ranked_matches to service_role;
grant select, insert, update, delete on public.ranked_match_state to service_role;
grant select, insert, update, delete on public.ranked_match_moves to service_role;

-- Existing server-owned gameplay functions, captured from the live DB.
-- Their actual SQL and timings are kept intact. Avoid changing them as part
-- of a migration-history backfill; behavior changes need a NEW migration.

CREATE OR REPLACE FUNCTION public.start_ranked_match(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_match_id UUID;
BEGIN
    INSERT INTO public.ranked_matches (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) WHERE status = 'active'
    DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id INTO v_match_id;
    INSERT INTO public.ranked_match_state (match_id)
    VALUES (v_match_id)
    ON CONFLICT (match_id) DO NOTHING;
    RETURN v_match_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranked_visible_board(p_match_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_match public.ranked_matches%ROWTYPE;
    v_state public.ranked_match_state%ROWTYPE;
    v_revealed JSONB;
    v_flags JSONB;
BEGIN
    SELECT *
    INTO v_match
    FROM public.ranked_matches
    WHERE id = p_match_id
      AND user_id = p_user_id
      AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active Ranked match not found';
    END IF;
    SELECT *
    INTO v_state
    FROM public.ranked_match_state
    WHERE match_id = p_match_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ranked board state missing';
    END IF;
    IF v_state.first_move_done
       AND v_state.mine_positions IS NULL THEN
        RAISE EXCEPTION 'Invalid Ranked board state';
    END IF;
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'row', cell.position / 16,
                'column', cell.position % 16,
                'adjacentMines', (
                    SELECT count(*)
                    FROM unnest(v_state.mine_positions)
                        AS mine(position)
                    WHERE abs(
                        mine.position / 16 - cell.position / 16
                    ) <= 1
                    AND abs(
                        mine.position % 16 - cell.position % 16
                    ) <= 1
                )
            )
            ORDER BY cell.position
        ),
        '[]'::JSONB
    )
    INTO v_revealed
    FROM unnest(v_state.revealed_positions)
        AS cell(position);
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'row', flag.position / 16,
                'column', flag.position % 16
            )
            ORDER BY flag.position
        ),
        '[]'::JSONB
    )
    INTO v_flags
    FROM unnest(v_state.flagged_positions)
        AS flag(position);
    RETURN jsonb_build_object(
        'matchId', p_match_id,
        'status', v_match.status,
        'rows', v_match.rows,
        'columns', v_match.columns,
        'mineCount', v_match.mine_count,
        'moveCount', v_match.move_count,
        'firstMoveDone', v_state.first_move_done,
        'startedAt', CASE
            WHEN v_state.first_move_done
            THEN v_match.started_at
            ELSE NULL
        END,
        'revealedCells', v_revealed,
        'flaggedCells', v_flags,
        'flagCount', cardinality(v_state.flagged_positions)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reveal_first_ranked_cell(p_match_id uuid, p_user_id uuid, p_row integer, p_column integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_match public.ranked_matches%ROWTYPE;
    v_state public.ranked_match_state%ROWTYPE;
    v_mines INTEGER[];
    v_queue INTEGER[];
    v_revealed INTEGER[] := ARRAY[]::INTEGER[];
    v_cell INTEGER;
    v_next INTEGER;
    v_row INTEGER;
    v_column INTEGER;
    v_adjacent INTEGER;
    v_visible_cells JSONB;
BEGIN
    IF p_row IS NULL OR p_column IS NULL
       OR p_row NOT BETWEEN 0 AND 15
       OR p_column NOT BETWEEN 0 AND 15 THEN
        RAISE EXCEPTION 'Invalid board position';
    END IF;
    SELECT *
    INTO v_match
    FROM public.ranked_matches
    WHERE id = p_match_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_match.user_id IS DISTINCT FROM p_user_id
       OR v_match.status <> 'active' THEN
        RAISE EXCEPTION 'Ranked match not available';
    END IF;
    SELECT *
    INTO v_state
    FROM public.ranked_match_state
    WHERE match_id = p_match_id
    FOR UPDATE;
    IF NOT FOUND OR v_state.first_move_done THEN
        RAISE EXCEPTION 'First move is unavailable';
    END IF;
    SELECT array_agg(position)
    INTO v_mines
    FROM (
        SELECT cell.position
        FROM generate_series(0, 255) AS cell(position)
        WHERE abs(cell.position / 16 - p_row) > 1
           OR abs(cell.position % 16 - p_column) > 1
        ORDER BY gen_random_uuid()
        LIMIT 40
    ) AS shuffled;
    IF cardinality(v_mines) <> 40 THEN
        RAISE EXCEPTION 'Could not generate Ranked board';
    END IF;
    v_queue := ARRAY[p_row * 16 + p_column];
    WHILE cardinality(v_queue) > 0 LOOP
        v_cell := v_queue[1];
        IF cardinality(v_queue) = 1 THEN
            v_queue := ARRAY[]::INTEGER[];
        ELSE
            v_queue := v_queue[2:cardinality(v_queue)];
        END IF;
        IF v_cell = ANY(v_revealed) THEN
            CONTINUE;
        END IF;
        IF v_cell = ANY(v_mines) THEN
            RAISE EXCEPTION 'Invalid board state';
        END IF;
        v_revealed := array_append(v_revealed, v_cell);
        SELECT count(*)
        INTO v_adjacent
        FROM unnest(v_mines) AS mine(position)
        WHERE abs(mine.position / 16 - v_cell / 16) <= 1
          AND abs(mine.position % 16 - v_cell % 16) <= 1;
        IF v_adjacent = 0 THEN
            FOR v_row IN greatest(0, v_cell / 16 - 1)
                         ..least(15, v_cell / 16 + 1) LOOP
                FOR v_column IN greatest(0, v_cell % 16 - 1)
                                ..least(15, v_cell % 16 + 1) LOOP
                    v_next := v_row * 16 + v_column;
                    IF NOT (v_next = ANY(v_revealed))
                       AND NOT (v_next = ANY(v_queue))
                       AND NOT (v_next = ANY(v_mines)) THEN
                        v_queue := array_append(v_queue, v_next);
                    END IF;
                END LOOP;
            END LOOP;
        END IF;
    END LOOP;
    UPDATE public.ranked_match_state
    SET mine_positions = v_mines,
        revealed_positions = v_revealed,
        first_move_done = true
    WHERE match_id = p_match_id;
    UPDATE public.ranked_matches
    SET started_at = clock_timestamp(),
        move_count = 1
    WHERE id = p_match_id;
    INSERT INTO public.ranked_match_moves (
        match_id,
        move_number,
        action,
        row_index,
        column_index
    )
    VALUES (
        p_match_id,
        1,
        'reveal',
        p_row,
        p_column
    );
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'row', opened.position / 16,
                'column', opened.position % 16,
                'adjacentMines', (
                    SELECT count(*)
                    FROM unnest(v_mines) AS mine(position)
                    WHERE abs(
                        mine.position / 16 - opened.position / 16
                    ) <= 1
                    AND abs(
                        mine.position % 16 - opened.position % 16
                    ) <= 1
                )
            )
            ORDER BY opened.position
        ),
        '[]'::JSONB
    )
    INTO v_visible_cells
    FROM unnest(v_revealed) AS opened(position);
    RETURN jsonb_build_object(
        'matchId', p_match_id,
        'status', 'active',
        'moveCount', 1,
        'revealedCells', v_visible_cells
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reveal_ranked_cell(p_match_id uuid, p_user_id uuid, p_row integer, p_column integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_match public.ranked_matches%ROWTYPE;
    v_state public.ranked_match_state%ROWTYPE;
    v_target INTEGER;
    v_cell INTEGER;
    v_neighbor INTEGER;
    v_row INTEGER;
    v_column INTEGER;
    v_adjacent INTEGER;
    v_queue INTEGER[] := ARRAY[]::INTEGER[];
    v_all_revealed INTEGER[];
    v_new_revealed INTEGER[] := ARRAY[]::INTEGER[];
    v_lost BOOLEAN := false;
    v_won BOOLEAN := false;
    v_status TEXT := 'active';
    v_finished_at TIMESTAMPTZ;
    v_duration BIGINT;
    v_visible_cells JSONB;
    v_result JSONB;
BEGIN
    IF p_row IS NULL OR p_column IS NULL
       OR p_row NOT BETWEEN 0 AND 15
       OR p_column NOT BETWEEN 0 AND 15 THEN
        RAISE EXCEPTION 'Invalid board position';
    END IF;
    SELECT *
    INTO v_match
    FROM public.ranked_matches
    WHERE id = p_match_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_match.user_id IS DISTINCT FROM p_user_id
       OR v_match.status <> 'active' THEN
        RAISE EXCEPTION 'Match is unavailable';
    END IF;
    SELECT *
    INTO v_state
    FROM public.ranked_match_state
    WHERE match_id = p_match_id
    FOR UPDATE;
    IF NOT FOUND
       OR NOT v_state.first_move_done
       OR v_state.mine_positions IS NULL THEN
        RAISE EXCEPTION 'First move has not been completed';
    END IF;
    v_target := p_row * 16 + p_column;
    IF v_target = ANY(v_state.revealed_positions)
       OR v_target = ANY(v_state.flagged_positions) THEN
        RAISE EXCEPTION 'Square is already revealed or flagged';
    END IF;
    v_all_revealed := v_state.revealed_positions;
    IF v_target = ANY(v_state.mine_positions) THEN
        v_lost := true;
    ELSE
        v_queue := ARRAY[v_target];
        WHILE cardinality(v_queue) > 0 LOOP
            v_cell := v_queue[1];
            IF cardinality(v_queue) = 1 THEN
                v_queue := ARRAY[]::INTEGER[];
            ELSE
                v_queue := v_queue[2:cardinality(v_queue)];
            END IF;
            IF v_cell = ANY(v_all_revealed)
               OR v_cell = ANY(v_state.flagged_positions) THEN
                CONTINUE;
            END IF;
            IF v_cell = ANY(v_state.mine_positions) THEN
                RAISE EXCEPTION 'Invalid reveal expansion';
            END IF;
            v_all_revealed :=
                array_append(v_all_revealed, v_cell);
            v_new_revealed :=
                array_append(v_new_revealed, v_cell);
            SELECT count(*)
            INTO v_adjacent
            FROM unnest(v_state.mine_positions) AS mine(position)
            WHERE abs(mine.position / 16 - v_cell / 16) <= 1
              AND abs(mine.position % 16 - v_cell % 16) <= 1;
            IF v_adjacent = 0 THEN
                FOR v_row IN greatest(0, v_cell / 16 - 1)
                             ..least(15, v_cell / 16 + 1) LOOP
                    FOR v_column IN greatest(0, v_cell % 16 - 1)
                                    ..least(15, v_cell % 16 + 1) LOOP
                        v_neighbor := v_row * 16 + v_column;
                        IF NOT (v_neighbor = ANY(v_all_revealed))
                           AND NOT (v_neighbor = ANY(v_queue))
                           AND NOT (v_neighbor = ANY(v_state.flagged_positions))
                           AND NOT (v_neighbor = ANY(v_state.mine_positions)) THEN
                            v_queue := array_append(
                                v_queue,
                                v_neighbor
                            );
                        END IF;
                    END LOOP;
                END LOOP;
            END IF;
        END LOOP;
    END IF;
    v_won := NOT v_lost
             AND cardinality(v_all_revealed) = 216;
    IF v_lost THEN
        v_status := 'lost';
    ELSIF v_won THEN
        v_status := 'won';
    END IF;
    IF v_lost OR v_won THEN
        v_finished_at := clock_timestamp();
        v_duration := greatest(
            0,
            floor(
                extract(epoch FROM (
                    v_finished_at - v_match.started_at
                )) * 1000
            )::BIGINT
        );
    END IF;
    UPDATE public.ranked_match_state
    SET revealed_positions = v_all_revealed
    WHERE match_id = p_match_id;
    UPDATE public.ranked_matches
    SET status = v_status,
        move_count = v_match.move_count + 1,
        finished_at = v_finished_at,
        duration_ms = v_duration
    WHERE id = p_match_id;
    INSERT INTO public.ranked_match_moves (
        match_id,
        move_number,
        action,
        row_index,
        column_index
    )
    VALUES (
        p_match_id,
        v_match.move_count + 1,
        'reveal',
        p_row,
        p_column
    );
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'row', opened.position / 16,
                'column', opened.position % 16,
                'adjacentMines', (
                    SELECT count(*)
                    FROM unnest(v_state.mine_positions) AS mine(position)
                    WHERE abs(
                        mine.position / 16 - opened.position / 16
                    ) <= 1
                    AND abs(
                        mine.position % 16 - opened.position % 16
                    ) <= 1
                )
            )
            ORDER BY opened.position
        ),
        '[]'::JSONB
    )
    INTO v_visible_cells
    FROM unnest(v_new_revealed) AS opened(position);
    v_result := jsonb_build_object(
        'matchId', p_match_id,
        'status', v_status,
        'moveCount', v_match.move_count + 1,
        'revealedCells', v_visible_cells,
        'totalRevealed', cardinality(v_all_revealed)
    );
    IF v_lost THEN
        v_result := v_result || jsonb_build_object(
            'hitMine', jsonb_build_object(
                'row', p_row,
                'column', p_column
            ),
            'minePositions', v_state.mine_positions,
            'durationMs', v_duration
        );
    ELSIF v_won THEN
        v_result := v_result || jsonb_build_object(
            'durationMs', v_duration
        );
    END IF;
    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_ranked_flag(p_match_id uuid, p_user_id uuid, p_row integer, p_column integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_match public.ranked_matches%ROWTYPE;
    v_state public.ranked_match_state%ROWTYPE;
    v_position INTEGER;
    v_flags INTEGER[];
    v_is_flagged BOOLEAN;
    v_action TEXT;
BEGIN
    IF p_row IS NULL OR p_column IS NULL
       OR p_row NOT BETWEEN 0 AND 15
       OR p_column NOT BETWEEN 0 AND 15 THEN
        RAISE EXCEPTION 'Invalid board position';
    END IF;
    SELECT *
    INTO v_match
    FROM public.ranked_matches
    WHERE id = p_match_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_match.user_id IS DISTINCT FROM p_user_id
       OR v_match.status <> 'active' THEN
        RAISE EXCEPTION 'Ranked match not available';
    END IF;
    SELECT *
    INTO v_state
    FROM public.ranked_match_state
    WHERE match_id = p_match_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ranked board not found';
    END IF;
    IF NOT v_state.first_move_done THEN
        RAISE EXCEPTION 'Reveal a square before flagging';
    END IF;
    v_position := p_row * 16 + p_column;
    v_flags := v_state.flagged_positions;
    IF v_position = ANY(v_state.revealed_positions) THEN
        RAISE EXCEPTION 'Cannot flag a revealed square';
    END IF;
    IF v_position = ANY(v_flags) THEN
        v_flags := array_remove(v_flags, v_position);
        v_is_flagged := false;
        v_action := 'unflag';
    ELSE
        IF cardinality(v_flags) >= 40 THEN
            RAISE EXCEPTION 'Maximum number of flags reached';
        END IF;
        v_flags := array_append(v_flags, v_position);
        v_is_flagged := true;
        v_action := 'flag';
    END IF;
    UPDATE public.ranked_match_state
    SET flagged_positions = v_flags
    WHERE match_id = p_match_id;
    UPDATE public.ranked_matches
    SET move_count = v_match.move_count + 1
    WHERE id = p_match_id;
    INSERT INTO public.ranked_match_moves (
        match_id,
        move_number,
        action,
        row_index,
        column_index
    )
    VALUES (
        p_match_id,
        v_match.move_count + 1,
        v_action,
        p_row,
        p_column
    );
    RETURN jsonb_build_object(
        'matchId', p_match_id,
        'status', 'active',
        'moveCount', v_match.move_count + 1,
        'row', p_row,
        'column', p_column,
        'flagged', v_is_flagged,
        'flagCount', cardinality(v_flags)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.chord_ranked_cell(p_match_id uuid, p_user_id uuid, p_row integer, p_column integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_match public.ranked_matches%ROWTYPE;
    v_state public.ranked_match_state%ROWTYPE;
    v_center INTEGER;
    v_number INTEGER;
    v_flag_count INTEGER;
    v_neighbors INTEGER[] := ARRAY[]::INTEGER[];
    v_queue INTEGER[] := ARRAY[]::INTEGER[];
    v_all_revealed INTEGER[];
    v_new_revealed INTEGER[] := ARRAY[]::INTEGER[];
    v_cell INTEGER;
    v_neighbor INTEGER;
    v_row INTEGER;
    v_column INTEGER;
    v_adjacent INTEGER;
    v_hit_mine INTEGER;
    v_status TEXT := 'active';
    v_finished_at TIMESTAMPTZ;
    v_duration BIGINT;
    v_visible_cells JSONB;
    v_result JSONB;
BEGIN
    IF p_row IS NULL OR p_column IS NULL
       OR p_row NOT BETWEEN 0 AND 15
       OR p_column NOT BETWEEN 0 AND 15 THEN
        RAISE EXCEPTION 'Invalid board position';
    END IF;
    SELECT *
    INTO v_match
    FROM public.ranked_matches
    WHERE id = p_match_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_match.user_id IS DISTINCT FROM p_user_id
       OR v_match.status <> 'active' THEN
        RAISE EXCEPTION 'Ranked match unavailable';
    END IF;
    SELECT *
    INTO v_state
    FROM public.ranked_match_state
    WHERE match_id = p_match_id
    FOR UPDATE;
    IF NOT FOUND
       OR NOT v_state.first_move_done
       OR v_state.mine_positions IS NULL THEN
        RAISE EXCEPTION 'Ranked board unavailable';
    END IF;
    v_center := p_row * 16 + p_column;
    IF NOT (v_center = ANY(v_state.revealed_positions)) THEN
        RAISE EXCEPTION 'Chord requires a revealed square';
    END IF;
    SELECT count(*)
    INTO v_number
    FROM unnest(v_state.mine_positions) AS mine(position)
    WHERE abs(mine.position / 16 - p_row) <= 1
      AND abs(mine.position % 16 - p_column) <= 1;
    IF v_number = 0 THEN
        RAISE EXCEPTION 'Cannot chord an empty square';
    END IF;
    SELECT count(*)
    INTO v_flag_count
    FROM unnest(v_state.flagged_positions) AS flag(position)
    WHERE abs(flag.position / 16 - p_row) <= 1
      AND abs(flag.position % 16 - p_column) <= 1;
    IF v_flag_count <> v_number THEN
        RAISE EXCEPTION 'Surrounding flag count does not match';
    END IF;
    FOR v_row IN greatest(0, p_row - 1)
                 ..least(15, p_row + 1) LOOP
        FOR v_column IN greatest(0, p_column - 1)
                        ..least(15, p_column + 1) LOOP
            v_neighbor := v_row * 16 + v_column;
            IF v_neighbor = ANY(v_state.revealed_positions)
               OR v_neighbor = ANY(v_state.flagged_positions) THEN
                CONTINUE;
            END IF;
            v_neighbors := array_append(v_neighbors, v_neighbor);
        END LOOP;
    END LOOP;
    IF cardinality(v_neighbors) = 0 THEN
        RAISE EXCEPTION 'No hidden neighbors to reveal';
    END IF;
    FOREACH v_neighbor IN ARRAY v_neighbors LOOP
        IF v_neighbor = ANY(v_state.mine_positions) THEN
            v_hit_mine := v_neighbor;
            EXIT;
        END IF;
    END LOOP;
    v_all_revealed := v_state.revealed_positions;
    IF v_hit_mine IS NOT NULL THEN
        v_status := 'lost';
    ELSE
        v_queue := v_neighbors;
        WHILE cardinality(v_queue) > 0 LOOP
            v_cell := v_queue[1];
            IF cardinality(v_queue) = 1 THEN
                v_queue := ARRAY[]::INTEGER[];
            ELSE
                v_queue := v_queue[2:cardinality(v_queue)];
            END IF;
            IF v_cell = ANY(v_all_revealed)
               OR v_cell = ANY(v_state.flagged_positions) THEN
                CONTINUE;
            END IF;
            IF v_cell = ANY(v_state.mine_positions) THEN
                RAISE EXCEPTION 'Invalid chord expansion';
            END IF;
            v_all_revealed :=
                array_append(v_all_revealed, v_cell);
            v_new_revealed :=
                array_append(v_new_revealed, v_cell);
            SELECT count(*)
            INTO v_adjacent
            FROM unnest(v_state.mine_positions) AS mine(position)
            WHERE abs(mine.position / 16 - v_cell / 16) <= 1
              AND abs(mine.position % 16 - v_cell % 16) <= 1;
            IF v_adjacent = 0 THEN
                FOR v_row IN greatest(0, v_cell / 16 - 1)
                             ..least(15, v_cell / 16 + 1) LOOP
                    FOR v_column IN greatest(0, v_cell % 16 - 1)
                                    ..least(15, v_cell % 16 + 1) LOOP
                        v_neighbor := v_row * 16 + v_column;
                        IF NOT (v_neighbor = ANY(v_all_revealed))
                           AND NOT (v_neighbor = ANY(v_queue))
                           AND NOT (v_neighbor = ANY(v_state.flagged_positions))
                           AND NOT (v_neighbor = ANY(v_state.mine_positions)) THEN
                            v_queue :=
                                array_append(v_queue, v_neighbor);
                        END IF;
                    END LOOP;
                END LOOP;
            END IF;
        END LOOP;
        IF cardinality(v_all_revealed) = 216 THEN
            v_status := 'won';
        END IF;
    END IF;
    IF v_status <> 'active' THEN
        v_finished_at := clock_timestamp();
        v_duration := greatest(
            0,
            floor(
                extract(epoch FROM (
                    v_finished_at - v_match.started_at
                )) * 1000
            )::BIGINT
        );
    END IF;
    UPDATE public.ranked_match_state
    SET revealed_positions = v_all_revealed
    WHERE match_id = p_match_id;
    UPDATE public.ranked_matches
    SET status = v_status,
        move_count = v_match.move_count + 1,
        finished_at = v_finished_at,
        duration_ms = v_duration
    WHERE id = p_match_id;
    INSERT INTO public.ranked_match_moves (
        match_id,
        move_number,
        action,
        row_index,
        column_index
    )
    VALUES (
        p_match_id,
        v_match.move_count + 1,
        'chord',
        p_row,
        p_column
    );
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'row', opened.position / 16,
                'column', opened.position % 16,
                'adjacentMines', (
                    SELECT count(*)
                    FROM unnest(v_state.mine_positions) AS mine(position)
                    WHERE abs(
                        mine.position / 16 - opened.position / 16
                    ) <= 1
                    AND abs(
                        mine.position % 16 - opened.position % 16
                    ) <= 1
                )
            )
            ORDER BY opened.position
        ),
        '[]'::JSONB
    )
    INTO v_visible_cells
    FROM unnest(v_new_revealed) AS opened(position);
    v_result := jsonb_build_object(
        'matchId', p_match_id,
        'status', v_status,
        'moveCount', v_match.move_count + 1,
        'revealedCells', v_visible_cells,
        'totalRevealed', cardinality(v_all_revealed)
    );
    IF v_status = 'lost' THEN
        v_result := v_result || jsonb_build_object(
            'hitMine', jsonb_build_object(
                'row', v_hit_mine / 16,
                'column', v_hit_mine % 16
            ),
            'minePositions', v_state.mine_positions,
            'durationMs', v_duration
        );
    ELSIF v_status = 'won' THEN
        v_result := v_result || jsonb_build_object(
            'durationMs', v_duration
        );
    END IF;
    RETURN v_result;
END;
$function$;

-- Postgres grants function EXECUTE to PUBLIC by default in many environments.
-- Revoke explicitly: these functions accept an identity argument and depend
-- on trusted Next.js handlers obtaining that identity via Supabase Auth.
-- Never call these directly from an untrusted browser session.
revoke all on function public.start_ranked_match(uuid) from public, anon, authenticated;
revoke all on function public.get_ranked_visible_board(uuid,uuid) from public, anon, authenticated;
revoke all on function public.reveal_first_ranked_cell(uuid,uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.reveal_ranked_cell(uuid,uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.toggle_ranked_flag(uuid,uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.chord_ranked_cell(uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.start_ranked_match(uuid) to service_role;
grant execute on function public.get_ranked_visible_board(uuid,uuid) to service_role;
grant execute on function public.reveal_first_ranked_cell(uuid,uuid,integer,integer) to service_role;
grant execute on function public.reveal_ranked_cell(uuid,uuid,integer,integer) to service_role;
grant execute on function public.toggle_ranked_flag(uuid,uuid,integer,integer) to service_role;
grant execute on function public.chord_ranked_cell(uuid,uuid,integer,integer) to service_role;

commit;
