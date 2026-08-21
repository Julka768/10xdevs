create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight numeric(5, 2) not null check (weight > 0),
  waist numeric(5, 2) check (waist > 0),
  chest numeric(5, 2) check (chest > 0),
  hips numeric(5, 2) check (hips > 0),
  arms numeric(5, 2) check (arms > 0),
  thighs numeric(5, 2) check (thighs > 0),
  logged_at date not null default current_date check (logged_at <= current_date),
  created_at timestamptz not null default now()
);

create index body_measurements_user_id_idx on public.body_measurements(user_id);
create index body_measurements_user_id_logged_at_idx on public.body_measurements(user_id, logged_at desc);

-- No denormalized/immutable fields on this table, so a plain grant (unlike
-- workout_logs' column-scoped update) is sufficient.
grant select, insert, update, delete on public.body_measurements to authenticated;

alter table public.body_measurements enable row level security;

create policy "body_measurements_select_own" on public.body_measurements
  for select to authenticated
  using (auth.uid() = user_id);

create policy "body_measurements_insert_own" on public.body_measurements
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "body_measurements_update_own" on public.body_measurements
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "body_measurements_delete_own" on public.body_measurements
  for delete to authenticated
  using (auth.uid() = user_id);
