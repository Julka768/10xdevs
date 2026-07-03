-- The "no future dates" rule for workout_logs.logged_at was only enforced by
-- the app's zod schema, unlike weight/reps/sets_completed which also have a
-- DB-level CHECK. Close the gap for any direct API/PostgREST usage.
alter table public.workout_logs
  add constraint workout_logs_logged_at_not_future check (logged_at <= current_date);
