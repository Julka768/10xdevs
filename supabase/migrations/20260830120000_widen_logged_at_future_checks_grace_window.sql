-- Match the app-layer's one-day grace window (see isNotFutureDate in
-- src/lib/date-utils.ts): the server never learns the submitter's real
-- timezone, so the app accepts a logged_at up to one day ahead of UTC
-- "today." These DB-level checks were still capped at current_date with no
-- grace window, so a legitimate grace-window submission would pass Zod and
-- then fail the database constraint.
alter table public.workout_logs
  drop constraint workout_logs_logged_at_not_future;

alter table public.workout_logs
  add constraint workout_logs_logged_at_not_future check (logged_at <= current_date + 1);

alter table public.calorie_logs
  drop constraint calorie_logs_logged_at_check;

alter table public.calorie_logs
  add constraint calorie_logs_logged_at_check check (logged_at <= current_date + 1);

alter table public.body_measurements
  drop constraint body_measurements_logged_at_check;

alter table public.body_measurements
  add constraint body_measurements_logged_at_check check (logged_at <= current_date + 1);
