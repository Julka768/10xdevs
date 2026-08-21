create table public.calorie_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calories integer not null check (calories > 0),
  logged_at date not null default current_date check (logged_at <= current_date),
  created_at timestamptz not null default now()
);

create index calorie_logs_user_id_idx on public.calorie_logs(user_id);
create index calorie_logs_user_id_logged_at_idx on public.calorie_logs(user_id, logged_at desc);

-- No denormalized/immutable fields on this table, so a plain grant (unlike
-- workout_logs' column-scoped update) is sufficient.
grant select, insert, update, delete on public.calorie_logs to authenticated;

alter table public.calorie_logs enable row level security;

create policy "calorie_logs_select_own" on public.calorie_logs
  for select to authenticated
  using (auth.uid() = user_id);

create policy "calorie_logs_insert_own" on public.calorie_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "calorie_logs_update_own" on public.calorie_logs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "calorie_logs_delete_own" on public.calorie_logs
  for delete to authenticated
  using (auth.uid() = user_id);
