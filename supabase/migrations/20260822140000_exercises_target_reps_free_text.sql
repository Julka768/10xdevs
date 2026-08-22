-- Allow target_reps to hold free text (e.g. "max", "AMRAP") in addition to numbers/ranges.
alter table public.exercises
  drop constraint if exists exercises_target_reps_check;

alter table public.exercises
  add constraint exercises_target_reps_check check (length(trim(target_reps)) between 1 and 20);
