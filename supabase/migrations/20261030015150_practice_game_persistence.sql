begin;

create table public.practice_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_record_id text not null
    check (char_length(client_record_id) between 1 and 128),
  game text not null default 'minesweeper'
    check (game = 'minesweeper'),
  mode text not null default 'practice'
    check (mode = 'practice'),
  difficulty text not null
    check (difficulty in ('Beginner', 'Intermediate', 'Expert')),
  rows integer not null check (rows between 2 and 50),
  columns integer not null check (columns between 2 and 50),
  mine_count integer not null check (mine_count >= 0 and mine_count < rows * columns),
  outcome text not null check (outcome in ('win', 'loss')),
  duration_seconds integer not null check (duration_seconds >= 0),
  mine_indices integer[] not null,
  move_count integer not null check (move_count between 1 and 10000),
  completed_at timestamptz not null,
  recording_version integer not null default 1 check (recording_version > 0),
  created_at timestamptz not null default now(),
  unique (user_id, client_record_id),
  check (cardinality(mine_indices) = mine_count),
  check (array_position(mine_indices, null) is null)
);

create table public.practice_game_moves (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.practice_games (id) on delete cascade,
  move_number integer not null check (move_number between 1 and 10000),
  "row" integer not null check ("row" between 0 and 49),
  "column" integer not null check ("column" between 0 and 49),
  action_type text not null
    check (action_type in ('reveal', 'flag', 'unflag', 'chord')),
  at_ms integer check (at_ms between 0 and 604800000),
  after_hash text check (after_hash ~ '^[0-9a-f]{8}$'),
  unique (game_id, move_number)
);

create index practice_games_user_completed_idx
  on public.practice_games (user_id, completed_at desc, created_at desc, id desc);

alter table public.practice_games enable row level security;
alter table public.practice_game_moves enable row level security;

revoke all on public.practice_games from public, anon;
revoke all on public.practice_game_moves from public, anon;
grant select, insert, update, delete on public.practice_games to authenticated;
grant select, insert, update, delete on public.practice_game_moves to authenticated;

create policy "Users can read their Practice games"
  on public.practice_games for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their Practice games"
  on public.practice_games for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their Practice games"
  on public.practice_games for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their Practice games"
  on public.practice_games for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read moves from their Practice games"
  on public.practice_game_moves for select to authenticated
  using (
    exists (
      select 1
      from public.practice_games as game
      where game.id = practice_game_moves.game_id
        and game.user_id = (select auth.uid())
    )
  );

create policy "Users can create moves for their Practice games"
  on public.practice_game_moves for insert to authenticated
  with check (
    exists (
      select 1
      from public.practice_games as game
      where game.id = practice_game_moves.game_id
        and game.user_id = (select auth.uid())
    )
  );

create policy "Users can update moves from their Practice games"
  on public.practice_game_moves for update to authenticated
  using (
    exists (
      select 1
      from public.practice_games as game
      where game.id = practice_game_moves.game_id
        and game.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.practice_games as game
      where game.id = practice_game_moves.game_id
        and game.user_id = (select auth.uid())
    )
  );

create policy "Users can delete moves from their Practice games"
  on public.practice_game_moves for delete to authenticated
  using (
    exists (
      select 1
      from public.practice_games as game
      where game.id = practice_game_moves.game_id
        and game.user_id = (select auth.uid())
    )
  );

create function public.enforce_practice_history_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  delete from public.practice_games as older
  where older.user_id = new.user_id
    and older.id not in (
      select keep.id
      from public.practice_games as keep
      where keep.user_id = new.user_id
      order by keep.completed_at desc, keep.created_at desc, keep.id desc
      limit 100
    );

  return null;
end;
$$;

revoke all on function public.enforce_practice_history_limit() from public, anon, authenticated;

create trigger enforce_practice_history_limit_after_insert
  after insert on public.practice_games
  for each row execute function public.enforce_practice_history_limit();

commit;
