-- AI-Coach: Ranked results sourced from the existing server-owned Ranked game.
-- REPLACES the earlier UNAPPLIED migration with this same filename.
-- Reviewed against the live Mindsweeper PostgreSQL schema on 2026-10-28.
-- Existing RPCs:
--   * Only the server-side service_role can invoke the six Ranked functions.
--   * The FIRST REVEAL sets ranked_matches.started_at using clock_timestamp().
--   * A reveal/chord RPC sets status='won', finished_at, duration_ms only after
--     all 216 safe squares have been revealed on a 16x16 / 40-mine board.
-- This migration uses those authoritative timings; it does NOT create a new
-- match-creation timer or accept results from browser-supplied data.
-- No old matches are backfilled. Test in staging and approve before deployment.

-- Fail if the database schema is not the one this migration was reviewed for.
do $$
begin
  if to_regclass('public.ranked_matches') is null
     or to_regclass('public.ranked_match_state') is null
     or to_regclass('public.ranked_match_moves') is null then
    raise exception 'Ranked tables are missing; review migration before applying.';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema='public' and table_name='ranked_matches'
      and column_name in (
        'id', 'user_id', 'status', 'rows', 'columns', 'mine_count',
        'started_at', 'finished_at', 'duration_ms'
      )
  ) <> 9 or (
    select count(*)
    from information_schema.columns
    where table_schema='public' and table_name='ranked_match_state'
      and column_name in (
        'match_id', 'first_move_done', 'mine_positions', 'revealed_positions'
      )
  ) <> 4 then
    raise exception 'Ranked columns do not match the reviewed schema.';
  end if;

  -- Prevent accidental deployment over the previous, different timer design.
  if to_regclass('public.ranked_match_timing') is not null
     or to_regclass('public.ranked_verified_results') is not null then
    raise exception 'Existing Ranked results/timer objects need migration review.';
  end if;

  if (
    select count(*) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'start_ranked_match','get_ranked_visible_board',
      'reveal_first_ranked_cell','reveal_ranked_cell',
      'toggle_ranked_flag','chord_ranked_cell'
    )
  ) <> 6 then
    raise exception 'Ranked gameplay functions differ from reviewed deployment.';
  end if;
end;
$$;

-- Only the trusted trigger inserts; direct player submission is forbidden.
create table public.ranked_verified_results (
  match_id uuid primary key references public.ranked_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_rows integer not null check (board_rows = 16),
  board_columns integer not null check (board_columns = 16),
  mine_count integer not null check (mine_count = 40),
  duration_ms bigint not null check (duration_ms > 0),
  finished_at timestamptz not null
);

create index ranked_verified_results_best_times
  on public.ranked_verified_results
  (board_rows, board_columns, mine_count, duration_ms, finished_at);

-- Lock down the existing game tables as defense in depth. They are already
-- backend-only in the reviewed live project; this makes it explicit.
revoke all on table public.ranked_matches from public, anon, authenticated;
revoke all on table public.ranked_match_state from public, anon, authenticated;
revoke all on table public.ranked_match_moves from public, anon, authenticated;
-- Supabase can give service_role automatic full privileges on newly created
-- public tables. Explicitly revoke those defaults: only the trigger's
-- SECURITY DEFINER owner may insert official results. The API gets SELECT.
revoke all on table public.ranked_verified_results from public, anon, authenticated, service_role;

-- Explicitly preserve the backend's write permissions after revoking PUBLIC.
grant select, insert, update, delete on table public.ranked_matches to service_role;
grant select, insert, update, delete on table public.ranked_match_state to service_role;
grant select, insert, update, delete on table public.ranked_match_moves to service_role;

alter table public.ranked_matches enable row level security;
alter table public.ranked_match_state enable row level security;
alter table public.ranked_match_moves enable row level security;
alter table public.ranked_verified_results enable row level security;

-- The Next.js GET endpoint uses only its server-side secret-role client.
-- Do not grant INSERT/UPDATE/DELETE on results to service_role.
grant select on table public.ranked_verified_results to service_role;

-- The RPCs accept user IDs as parameters. Keep the caller boundary on the
-- Next.js backend (which checks the authenticated user) rather than exposing
-- those functions directly through the Data API.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'start_ranked_match', 'get_ranked_visible_board',
      'reveal_first_ranked_cell', 'reveal_ranked_cell',
      'toggle_ranked_flag', 'chord_ranked_cell'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end;
$$;

-- Executed ONLY by the status-update trigger. SECURITY DEFINER is required
-- because service_role has SELECT but intentionally no INSERT on results.
-- Fully qualified objects and an empty search_path prevent search-path attacks.
create function public.record_verified_ranked_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_valid boolean := false;
  v_expected_duration bigint;
begin
  -- No result for a loss, active match, stale win, or non-active transition.
  if old.status is distinct from 'active' or new.status is distinct from 'won' then
    return new;
  end if;

  -- The existing verified reveal/chord RPCs set these values in PostgreSQL.
  -- Check that duration matches those timestamps; don't choose a new clock.
  if new.rows is distinct from 16
     or new.columns is distinct from 16
     or new.mine_count is distinct from 40
     or new.started_at is null
     or new.finished_at is null
     or new.finished_at < new.started_at
     or new.duration_ms is null
     or new.duration_ms <= 0 then
    raise exception 'Invalid server-owned Ranked win timing or board dimensions.';
  end if;

  v_expected_duration := greatest(
    0::bigint,
    floor(extract(epoch from (new.finished_at - new.started_at)) * 1000)::bigint
  );
  if new.duration_ms <> v_expected_duration then
    raise exception 'Ranked win duration does not match its server timestamps.';
  end if;

  -- Validate actual revealed game state in addition to trusting the RPC's
  -- status transition. 40 unique mines + 216 unique, non-mined revealed cells
  -- in a 256-square board proves all safe squares were revealed.
  select
    s.first_move_done
    and s.mine_positions is not null
    and cardinality(s.mine_positions) = 40
    and cardinality(s.revealed_positions) = 216
    and (select count(distinct mine.position)
         from unnest(s.mine_positions) as mine(position)) = 40
    and (select count(distinct revealed.position)
         from unnest(s.revealed_positions) as revealed(position)) = 216
    and not exists (
      select 1 from unnest(s.mine_positions) as mine(position)
      where mine.position is null or mine.position not between 0 and 255
    )
    and not exists (
      select 1 from unnest(s.revealed_positions) as revealed(position)
      where revealed.position is null or revealed.position not between 0 and 255
         or revealed.position = any(s.mine_positions)
    )
  into v_board_valid
  from public.ranked_match_state as s
  where s.match_id = new.id;

  if not coalesce(v_board_valid, false) then
    -- Fails closed: a tampered or inconsistent state must not become a win.
    -- This exception also rolls back the status update so it can be diagnosed.
    raise exception 'Ranked victory is not supported by its stored board.';
  end if;

  insert into public.ranked_verified_results (
    match_id, user_id, board_rows, board_columns, mine_count,
    duration_ms, finished_at
  ) values (
    new.id, new.user_id, new.rows, new.columns, new.mine_count,
    new.duration_ms, new.finished_at
  ) on conflict (match_id) do nothing;

  return new;
end;
$$;

-- A trigger function cannot be invoked as a normal RPC; additionally revoke
-- all direct EXECUTE grants for defense in depth.
revoke all on function public.record_verified_ranked_win() from public, anon, authenticated;

create trigger capture_verified_ranked_win
  after update of status on public.ranked_matches
  for each row execute function public.record_verified_ranked_win();

-- Deliberate migration behavior:
--   * Only wins completed AFTER deployment are written to verified results.
--   * Existing losses and any legacy/prototype JSON wins are ignored.
--   * The API GET returns an empty verified list until a real new win occurs.
--   * Never deploy without staging verification of legitimate reveal AND chord wins.
