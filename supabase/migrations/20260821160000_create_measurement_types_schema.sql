create table public.measurement_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create index measurement_types_user_id_idx on public.measurement_types(user_id);

-- user_id/created_at are immutable after creation; only the name can be
-- renamed, so the update grant is column-scoped to that field alone.
grant select, insert, delete on public.measurement_types to authenticated;
grant update (name) on public.measurement_types to authenticated;

alter table public.measurement_types enable row level security;

create policy "measurement_types_select_own" on public.measurement_types
  for select to authenticated
  using (auth.uid() = user_id);

create policy "measurement_types_insert_own" on public.measurement_types
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "measurement_types_update_own" on public.measurement_types
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "measurement_types_delete_own" on public.measurement_types
  for delete to authenticated
  using (auth.uid() = user_id);

create table public.measurement_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measurement_id uuid not null references public.body_measurements(id) on delete cascade,
  type_id uuid not null references public.measurement_types(id) on delete cascade,
  value numeric(5, 2) not null check (value > 0),
  created_at timestamptz not null default now(),
  unique (measurement_id, type_id)
);

create index measurement_values_user_id_idx on public.measurement_values(user_id);
create index measurement_values_measurement_id_idx on public.measurement_values(measurement_id);

-- measurement_id/type_id/user_id are immutable after creation (the unique
-- pair is the identity of the row); only value can change, via the upsert
-- flow in the measurements API routes. Column-scoped update grant enforces
-- this regardless of RLS, mirroring workout_logs' immutable-columns pattern.
grant select, insert, delete on public.measurement_values to authenticated;
grant update (value) on public.measurement_values to authenticated;

alter table public.measurement_values enable row level security;

create policy "measurement_values_select_own" on public.measurement_values
  for select to authenticated
  using (auth.uid() = user_id);

-- FK-ownership check mirrors workout_logs' insert policy: auth.uid() = user_id
-- alone isn't enough, since a caller could otherwise attach a value to
-- another user's measurement entry or type by forging measurement_id/type_id
-- while keeping their own user_id.
create policy "measurement_values_insert_own" on public.measurement_values
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.body_measurements bm
      where bm.id = measurement_id and bm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.measurement_types mt
      where mt.id = type_id and mt.user_id = auth.uid()
    )
  );

create policy "measurement_values_update_own" on public.measurement_values
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "measurement_values_delete_own" on public.measurement_values
  for delete to authenticated
  using (auth.uid() = user_id);
