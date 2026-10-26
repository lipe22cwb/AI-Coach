create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  coaching_style text not null default 'balanced'
    check (coaching_style in ('encouraging', 'balanced', 'direct')),
  explanation_detail text not null default 'standard'
    check (explanation_detail in ('brief', 'standard', 'detailed')),
  experience_level text not null default 'some'
    check (experience_level in ('new', 'some', 'experienced')),
  selected_goals text[] not null default '{}'
    check (selected_goals <@ array['patterns', 'logic', 'guessing', 'flagging', 'efficiency']::text[]),
  custom_goal text not null default ''
    check (char_length(custom_goal) <= 160),
  competitiveness text not null default 'balanced'
    check (competitiveness in ('relaxed', 'balanced', 'competitive')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can read their preferences" on public.user_preferences;
create policy "Users can read their preferences"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their preferences" on public.user_preferences;
create policy "Users can create their preferences"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their preferences" on public.user_preferences;
create policy "Users can update their preferences"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.user_preferences to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute procedure public.set_updated_at();
