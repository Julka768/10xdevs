# Log Workout Against Plan Implementation Plan

## Overview

Let a logged-in user log a workout session (exercise, weight, reps, sets completed, date) against an exercise in their own training plan, and see their own logged history for that plan. This is roadmap slice S-02 — the north star — implementing US-01/FR-001/FR-005.

## Current State Analysis

- `training_plans` and `exercises` exist (`supabase/migrations/20260703121505_create_training_plan_schema.sql`, hardened by `20260703140000_harden_exercises_plan_ownership_rls.sql`), each with owner-only RLS and explicit `authenticated` GRANTs.
- `/dashboard/plans/[id].astro` renders a plan's exercises (name, target sets/reps) with inline add/edit (via `?edit=<id>`) and delete (`DeleteConfirmButton` island) — all through form-POST API routes under `/api/plans/[id]/...` that validate with zod (`src/lib/validation/training-plan.ts`) and redirect with `?error=` on failure.
- No workout-logging table, route, or UI exists yet.

## Desired End State

A user viewing `/dashboard/plans/[id]` can, per exercise, log a workout entry (weight, reps, sets completed, date — defaults to today) and see all their logged entries for that plan grouped by date below the exercises section, each editable and deletable. Entries are private to the logging user (verified via RLS) and remain visible with the exercise's name even if that exercise is later deleted from the plan.

Verify via: `npm run build` succeeds, migration applies cleanly against local Supabase, and the manual flow (log an entry, see it in history grouped by date, edit it, delete it, delete the source exercise and confirm the log entry survives with its name) all work as described.

### Key Discoveries:

- `exercises_insert_own`/`exercises_update_own` policies check both `user_id` and that `plan_id` belongs to a plan owned by the same user (`20260703140000_harden_exercises_plan_ownership_rls.sql:10-29`) — the lesson in `context/foundation/lessons.md` ("Pair RLS with explicit GRANTs") plus this later hardening are both priors for `workout_logs`'s RLS: write it correctly the first time instead of shipping the naive version and hardening later.
- The inline-edit-via-query-param pattern (`?edit=<id>` on `/dashboard/plans/[id].astro:15,62-100`) is the established UX for "edit in place on the same page" — reuse it for both logging and log-entry editing rather than introducing a new page.
- `exercises` table has no `ON DELETE` guard against existing references besides the plan-level cascade — deleting an exercise today has no dependents to worry about; `workout_logs.exercise_id` must be added as nullable with `ON DELETE SET NULL` so exercise deletion doesn't require new application-level guards.

## What We're NOT Doing

- No `workout_sessions` grouping entity — log rows are flat, grouped by date only in the UI.
- No per-set logging (each row is one exercise attempt with an aggregate weight/reps/sets_completed, not one row per set).
- No dedicated "Log Workout" page — logging happens inline on the existing plan detail page.
- No changes to the `exercises` table or its deletion behavior — deleting an exercise remains unguarded; `workout_logs` absorbs the consequence via `ON DELETE SET NULL` + a snapshotted name.
- No cross-plan log view — history is scoped to the plan being viewed (S-06 will aggregate across all logs later).

## Implementation Approach

Follow the exact pattern S-01 established: a Supabase migration (schema + RLS + GRANTs) first, then form-POST API routes with zod validation, then Astro UI reusing the existing plan detail page's conventions (inline query-param-driven forms, `DeleteConfirmButton` island).

## Critical Implementation Details

### State sequencing

`workout_logs` denormalizes `plan_id` (not just `exercise_id`) specifically so that deleting a single exercise (`exercise_id` → `NULL` via `ON DELETE SET NULL`) does not orphan a log entry from its plan — the history view for a plan queries by `plan_id`, not by joining through `exercise_id`. Insert must therefore write `plan_id`, `exercise_id`, and a snapshotted `exercise_name` all at once from the exercise being logged against; none of the three are user-editable after creation (the edit form only ever touches `weight`, `reps`, `sets_completed`, `logged_at`).

## Phase 1: Data foundation — `workout_logs` schema

### Overview

Create the `workout_logs` table with RLS written correctly from the start (plan+exercise ownership check on insert, matching the already-hardened `exercises` policies) and explicit GRANTs.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_workout_logs_schema.sql` (stamp the real current timestamp per repo convention)

**Intent**: Add the `workout_logs` table so a logged entry can be persisted against a specific exercise/plan, survive that exercise being deleted, and be visible only to its owner.

**Contract**:
```sql
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
```
`weight` uses `numeric(6,2)` (not integer) to allow fractional plate loading (e.g. 62.5kg). `plan_id`/`exercise_id`/`exercise_name` are immutable after creation by design (see "Critical Implementation Details" above) — that invariant is enforced at the grant level, not just by the API never sending those fields: the `update` GRANT is column-scoped to `weight, reps, sets_completed, logged_at` only, so any UPDATE statement touching the other columns fails on the underlying privilege check before RLS is even evaluated, regardless of whether it's issued through this app's routes or directly against Supabase's REST API with the user's own session. This mirrors the lesson recorded after `exercises_update_own` needed a follow-up hardening migration: don't rely on the app layer to gatekeep write scope when RLS/GRANTs are the actual enforcement boundary. The `update` policy's `with check (auth.uid() = user_id)` (no plan/exercise exists-check) is therefore correct as written — ownership of the row is the only thing left to verify once the grant already locks down which columns can move.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or project's equivalent migrate command)
- Type check passes: `npm run build` (Astro build runs `astro check` as part of SSR build)
- Linting passes: `npm run lint`

#### Manual Verification:

- As user A, inserting a `workout_logs` row referencing a plan/exercise owned by user B fails (RLS blocks it)
- As user A, inserting a `workout_logs` row with `exercise_id = null` (simulating a deleted exercise) succeeds when `plan_id` is still owned by user A
- Deleting an exercise that has a `workout_logs` row referencing it leaves the row intact with `exercise_id = null`

---

## Phase 2: API routes — create, update, delete log entries

### Overview

Form-POST routes mirroring the `exercises` routes' shape: create scoped under the exercise being logged against, update/delete scoped under the log entry's own id.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/validation/training-plan.ts`

**Intent**: Add a zod schema for the log entry's user-editable fields, validating that `logged_at` is not in the future (a workout can't be logged before it happened).

**Contract**: Export `workoutLogInputSchema` alongside `exerciseInputSchema`: `weight` (`z.coerce.number().positive()`), `reps` (`z.coerce.number().int().positive()`), `sets_completed` (`z.coerce.number().int().positive()`), `logged_at` (`z.string()` refined to reject future dates by comparing the raw `YYYY-MM-DD` string against today's UTC date formatted the same way — not a `Date` object `<=` comparison, which would introduce a timezone-dependent off-by-one near midnight). This is the one schema used by both create and update — create additionally supplies `plan_id`/`exercise_id`/`exercise_name` server-side from route params, never from form input.

#### 2. Create route

**File**: `src/pages/api/plans/[id]/exercises/[exerciseId]/logs.ts`

**Intent**: Insert a `workout_logs` row for the given plan+exercise, looking up the exercise's current `name` server-side to snapshot as `exercise_name` (never trust a client-supplied name).

**Contract**: `POST`, `context.params` gives `id` (plan) and `exerciseId`. Follows the exact structure of `src/pages/api/plans/[id]/exercises/index.ts:5-44` (auth check → form parse → zod validate → redirect with `?error=` on failure → insert → redirect to `/dashboard/plans/${id}` on success), with one addition: fetch `exercises.name` for `exerciseId` before insert (404/redirect if it doesn't belong to this plan/user) to populate `exercise_name`.

#### 3. Update route

**File**: `src/pages/api/plans/[id]/logs/[logId]/update.ts`

**Intent**: Update `weight`, `reps`, `sets_completed`, `logged_at` on an existing log entry the user owns.

**Contract**: `POST`, mirrors `src/pages/api/plans/[id]/exercises/[exerciseId]/update.ts`'s structure — parse form with `workoutLogInputSchema`, `update` on `workout_logs` filtered `.eq("id", logId)` (RLS enforces ownership), redirect to `/dashboard/plans/${id}` with `?error=` on failure.

#### 4. Delete route

**File**: `src/pages/api/plans/[id]/logs/[logId]/delete.ts`

**Intent**: Delete a log entry the user owns.

**Contract**: `POST`, mirrors `src/pages/api/plans/[id]/exercises/[exerciseId]/delete.ts`'s structure exactly (delete filtered by id, RLS enforces ownership, redirect back to the plan page).

### Success Criteria:

#### Automated Verification:

- Type check passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Submitting the log form with a future `logged_at` redirects with an error and does not insert a row
- Submitting valid weight/reps/sets/date creates a row visible only to the logging user
- Editing a log entry updates only the 4 editable fields; `plan_id`/`exercise_id`/`exercise_name` are unchanged
- Deleting a log entry removes it and redirects back to the plan page

---

## Phase 3: UI — inline logging and date-grouped history

### Overview

Extend `/dashboard/plans/[id].astro` with a per-exercise "Log" action (inline form, same query-param pattern as exercise editing) and a history section below the exercises list, grouped by `logged_at`, each entry with inline edit and delete.

### Changes Required:

#### 1. Plan detail page

**File**: `src/pages/dashboard/plans/[id].astro`

**Intent**: Add a "Log" action per exercise row that reveals an inline form (weight, reps, sets completed, date — date input defaults to today) posting to the Phase 2 create route; add a "Workout Log" section below the exercises card that queries `workout_logs` for this plan ordered by `logged_at desc, created_at desc`, groups rows by date in the template, and renders each with inline edit (same query-param-revealed form pattern as exercises) and a `DeleteConfirmButton`.

**Contract**: Reuses the existing `?edit=<exerciseId>` param for exercise editing unchanged; adds two new query params — `?log=<exerciseId>` (show the log-creation form under that exercise row) and `?editLog=<logId>` (show the edit form in place of that log entry). The date `<Input type="date">` for both create and edit forms defaults its `value` to today's date (`YYYY-MM-DD`) computed server-side in the Astro frontmatter. Grouping by date happens in the frontmatter (reduce the fetched rows into an ordered map keyed by `logged_at`) before rendering — no new component needed, plain Astro control flow matching the existing exercises `.map()` block.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- From `/dashboard/plans/[id]`, clicking "Log" under an exercise reveals a form; submitting it shows the new entry in the history section grouped under today's date
- History entries are grouped and ordered by date, most recent first
- Editing and deleting a history entry works in place, without navigating away
- A log entry logged against an exercise that is subsequently deleted still appears in history with its original exercise name
- Logging in as a second user shows no history entries from the first user's plans

---

## Testing Strategy

### Unit Tests:

- No test suite exists in this repo yet (per `CLAUDE.md`); rely on automated verification (build/lint/typecheck) and manual verification per phase.

### Integration Tests:

- N/A — no test harness. RLS behavior is verified manually against local Supabase per Phase 1's manual checks.

### Manual Testing Steps:

1. Log in as user A with an existing plan (from S-01), log a workout entry against one of its exercises.
2. Confirm the entry appears in the plan's history section, grouped under the entry's date.
3. Edit the entry's weight/reps/sets; confirm the update is reflected without changing the exercise it's logged against.
4. Delete the entry; confirm it disappears from history.
5. Log a new entry, then delete the exercise it references from the plan; confirm the entry remains in history showing the original exercise name.
6. Log in as user B; confirm none of user A's log entries are visible anywhere.

## Performance Considerations

None beyond existing patterns — `workout_logs` is indexed on `(plan_id, logged_at desc)` for the history query, matching the indexing already applied to `exercises`.

## Migration Notes

New table, no existing data to migrate.

## References

- Prior implementation: `context/changes/create-and-manage-training-plan/plan.md`
- RLS hardening lesson: `supabase/migrations/20260703140000_harden_exercises_plan_ownership_rls.sql`, `context/foundation/lessons.md`
- Roadmap entry: `context/foundation/roadmap.md` (S-02)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation — `workout_logs` schema

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase — bd356e7
- [x] 1.2 Type check passes — bd356e7
- [x] 1.3 Linting passes — bd356e7

#### Manual

- [x] 1.4 Cross-user insert into `workout_logs` is blocked by RLS — bd356e7
- [x] 1.5 Insert with `exercise_id = null` succeeds when `plan_id` is owned by the user — bd356e7
- [x] 1.6 Deleting a referenced exercise leaves the log row intact with `exercise_id = null` — bd356e7

### Phase 2: API routes — create, update, delete log entries

#### Automated

- [x] 2.1 Type check passes — ae30890
- [x] 2.2 Linting passes — ae30890

#### Manual

- [x] 2.3 Future-dated `logged_at` is rejected with an error, no row inserted — 4592c8a
- [x] 2.4 Valid submission creates a row visible only to the logging user — 4592c8a
- [x] 2.5 Editing updates only weight/reps/sets/date — 4592c8a
- [x] 2.6 Deleting removes the entry and redirects back to the plan page — 4592c8a

### Phase 3: UI — inline logging and date-grouped history

#### Automated

- [x] 3.1 Type check passes — 4592c8a
- [x] 3.2 Linting passes — 4592c8a

#### Manual

- [x] 3.3 Logging via the inline form shows the new entry grouped under today's date — 4592c8a
- [x] 3.4 History entries are grouped and ordered by date, most recent first — 4592c8a
- [x] 3.5 Inline edit and delete work without navigating away — 4592c8a
- [x] 3.6 A log entry survives its source exercise being deleted, showing the snapshotted name — 4592c8a
- [x] 3.7 A second user sees no entries from the first user's plans — 4592c8a
