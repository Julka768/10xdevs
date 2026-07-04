create table public.body_composition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('lose', 'gain', 'maintain')),
  created_at timestamptz not null default now()
);

create index body_composition_goals_user_id_created_at_idx on public.body_composition_goals(user_id, created_at desc);

-- Append-only by design: only select/insert are granted. There is no update or
-- delete path — editing a goal always inserts a new row, and "current goal" is
-- derived as the most recent row per user_id. No update/delete grant or policy
-- should ever be added without revisiting this invariant.
grant select, insert on public.body_composition_goals to authenticated;

alter table public.body_composition_goals enable row level security;

create policy "body_composition_goals_select_own" on public.body_composition_goals
  for select to authenticated
  using (auth.uid() = user_id);

create policy "body_composition_goals_insert_own" on public.body_composition_goals
  for insert to authenticated
  with check (auth.uid() = user_id);
