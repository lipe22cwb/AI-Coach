-- Server-verified Ranked results. REVIEW AGAINST THE DEPLOYED RANKED SCHEMA.
-- Required existing public.ranked_matches columns: id uuid, user_id uuid,
-- status text/enum ('active', 'won', 'lost'). All game outcome transitions must
-- be performed by the existing privileged server-owned Ranked RPCs.
-- This migration intentionally does NOT backfill old results or active games.
-- Do not apply unless the team has confirmed the live RPCs mark a real win
-- by transitioning public.ranked_matches.status from 'active' to 'won'.

-- Stop if the teammate's deployed Ranked table is absent/incompatible.
do $$
begin
  if to_regclass('public.ranked_matches') is null
     or to_regclass('public.ranked_match_state') is null then
    raise exception 'Ranked security migration requires ranked_matches and ranked_match_state';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ranked_matches'
      and column_name = 'id' and udt_name = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ranked_matches'
      and column_name = 'user_id' and udt_name = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ranked_matches'
      and column_name = 'status'
  ) then
    raise exception 'ranked_matches must have id uuid, user_id uuid, status';
  end if;
end;
$$;

-- Clock start is generated INSIDE Postgres when a match row is inserted.
-- Never permit a player to supply this timestamp.
create table if not exists public.ranked_match_timing (
  match_id uuid primary key references public.ranked_matches(id) on delete cascade,
  started_at timestamptz not null
);

-- The ONLY recognized competitive results come from a trusted status change.
-- Fixed Intermediate 16 x 16 / 40 mine configuration for the current MVP.
create table if not exists public.ranked_verified_results (
  match_id uuid primary key references public.ranked_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_rows integer not null default 16 check (board_rows = 16),
  board_columns integer not null default 16 check (board_columns = 16),
  mine_count integer not null default 40 check (mine_count = 40),
  duration_ms bigint not null check (duration_ms > 0),
  finished_at timestamptz not null
);

create index if not exists ranked_verified_results_best_times
  on public.ranked_verified_results
  (board_rows, board_columns, mine_count, duration_ms, finished_at);

-- Keep source-of-truth Ranked tables and new results inaccessible for direct
-- browser operations. Existing Next.js Ranked routes use a server-only admin
-- Supabase client. Do not revoke service_role or break its privileges.
revoke all on table public.ranked_matches from anon, authenticated;
revoke all on table public.ranked_match_state from anon, authenticated;
revoke all on table public.ranked_match_timing from public, anon, authenticated;
revoke all on table public.ranked_verified_results from public, anon, authenticated;

alter table public.ranked_matches enable row level security;
alter table public.ranked_match_state enable row level security;
alter table public.ranked_match_timing enable row level security;
alter table public.ranked_verified_results enable row level security;

grant select on table public.ranked_verified_results to service_role;

-- Existing project RPCs accept user IDs as arguments. Only privileged server
-- code should invoke them; otherwise a client could try another user's ID.
-- Match all overloads by name and revoke every signature, then explicitly
-- regrant execution to service_role (the Next.js server's secret-key client).
do $$
declare
  func record;
begin
  for func in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'start_ranked_match', 'get_ranked_visible_board',
      'reveal_first_ranked_cell', 'reveal_ranked_cell',
      'toggle_ranked_flag', 'chord_ranked_cell'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', func.sig);
    execute format('grant execute on function %s to service_role', func.sig);
  end loop;
end;
$$;

create or replace function public.record_ranked_match_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ranked_match_timing (match_id, started_at)
  values (new.id, pg_catalog.clock_timestamp())
  on conflict (match_id) do nothing;
  return new;
end;
$$;

create or replace function public.record_verified_ranked_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status::text is distinct from 'won' and new.status::text = 'won' then
    -- No timer? This match began before migration. Ignore it instead of
    -- inventing an elapsed time or trusting a duration in a client payload.
    insert into public.ranked_verified_results
      (match_id, user_id, board_rows, board_columns, mine_count,
       duration_ms, finished_at)
    select
      new.id, new.user_id, 16, 16, 40,
      greatest(
        1::bigint,
        ceil(
          extract(epoch from (pg_catalog.clock_timestamp() - t.started_at)) * 1000
        )::bigint
      ),
      pg_catalog.clock_timestamp()
    from public.ranked_match_timing as t
    where t.match_id = new.id
    on conflict (match_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_ranked_match_start() from public, anon, authenticated;
revoke all on function public.record_verified_ranked_win() from public, anon, authenticated;

drop trigger if exists capture_ranked_match_start on public.ranked_matches;
create trigger capture_ranked_match_start
  after insert on public.ranked_matches
  for each row execute function public.record_ranked_match_start();

drop trigger if exists capture_verified_ranked_win on public.ranked_matches;
create trigger capture_verified_ranked_win
  after update of status on public.ranked_matches
  for each row execute function public.record_verified_ranked_win();

-- Only NEW matches started AFTER this migration qualify for official times.
-- Never import data/ranked-results.json into this table.
