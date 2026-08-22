-- Allow target_reps to express a rep range (e.g. "8-10") instead of a single number.
alter table public.exercises
  drop constraint if exists exercises_target_reps_check;

alter table public.exercises
  alter column target_reps type text using target_reps::text;

alter table public.exercises
  add constraint exercises_target_reps_check check (
    target_reps ~ '^[1-9][0-9]*(-[1-9][0-9]*)?$'
    and (
      position('-' in target_reps) = 0
      or split_part(target_reps, '-', 1)::int <= split_part(target_reps, '-', 2)::int
    )
  );
