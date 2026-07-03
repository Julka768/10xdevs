create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null check (length(trim(exercise_name)) > 0),
  weight numeric(6, 2) not null check (weight > 0),
  reps integer not null check (reps > 0),
  sets_completed integer not null check (sets_completed > 0),
  logged_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index workout_logs_user_id_idx on public.workout_logs(user_id);
create index workout_logs_plan_id_idx on public.workout_logs(plan_id);
create index workout_logs_logged_at_idx on public.workout_logs(plan_id, logged_at desc);

grant select, insert, delete on public.workout_logs to authenticated;
grant update (weight, reps, sets_completed, logged_at) on public.workout_logs to authenticated;

alter table public.workout_logs enable row level security;

create policy "workout_logs_select_own" on public.workout_logs
  for select to authenticated
  using (auth.uid() = user_id);

create policy "workout_logs_insert_own" on public.workout_logs
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.training_plans tp
      where tp.id = plan_id and tp.user_id = auth.uid()
    )
    and (
      exercise_id is null
      or exists (
        select 1 from public.exercises e
        where e.id = exercise_id and e.user_id = auth.uid() and e.plan_id = workout_logs.plan_id
      )
    )
  );

create policy "workout_logs_update_own" on public.workout_logs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "workout_logs_delete_own" on public.workout_logs
  for delete to authenticated
  using (auth.uid() = user_id);
