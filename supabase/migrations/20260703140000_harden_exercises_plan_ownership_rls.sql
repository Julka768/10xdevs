-- exercises.user_id is denormalized from its parent plan; the insert/update
-- policies checked auth.uid() = user_id but never that plan_id actually
-- belongs to a plan owned by that same user. This let another authenticated
-- user insert a row against someone else's plan_id (satisfying the FK and
-- the user_id check) and squat on (plan_id, position) slots, causing the
-- plan owner's own inserts to fail with unique_violation.
drop policy "exercises_insert_own" on public.exercises;
drop policy "exercises_update_own" on public.exercises;

create policy "exercises_insert_own" on public.exercises
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.training_plans tp
      where tp.id = plan_id and tp.user_id = auth.uid()
    )
  );

create policy "exercises_update_own" on public.exercises
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.training_plans tp
      where tp.id = plan_id and tp.user_id = auth.uid()
    )
  );
