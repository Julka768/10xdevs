-- training_plans
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create index training_plans_user_id_idx on public.training_plans(user_id);

grant select, insert, update, delete on public.training_plans to authenticated;

alter table public.training_plans enable row level security;

create policy "training_plans_select_own" on public.training_plans
  for select to authenticated
  using (auth.uid() = user_id);

create policy "training_plans_insert_own" on public.training_plans
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "training_plans_update_own" on public.training_plans
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "training_plans_delete_own" on public.training_plans
  for delete to authenticated
  using (auth.uid() = user_id);

-- exercises
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_sets integer not null check (target_sets > 0),
  target_reps integer not null check (target_reps > 0),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (plan_id, position)
);

create index exercises_plan_id_idx on public.exercises(plan_id);
create index exercises_user_id_idx on public.exercises(user_id);

grant select, insert, update, delete on public.exercises to authenticated;

alter table public.exercises enable row level security;

create policy "exercises_select_own" on public.exercises
  for select to authenticated
  using (auth.uid() = user_id);

create policy "exercises_insert_own" on public.exercises
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "exercises_update_own" on public.exercises
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "exercises_delete_own" on public.exercises
  for delete to authenticated
  using (auth.uid() = user_id);
