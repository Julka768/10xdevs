# Log Daily Calories Implementation Plan

## Overview

Let a logged-in user log calories consumed on a given day, view their own history grouped by date with a per-day total, and edit or delete individual entries. This is roadmap slice S-04, implementing FR-006. It has no prerequisites and reuses the typed-client/zod/shadcn foundation already built in `create-and-manage-training-plan` (S-01).

## Current State Analysis

- No calorie-related table, route, or UI exists yet.
- The established per-user-owned-table pattern (from `training_plans`/`exercises`/`workout_logs`) is: RLS enabled, four per-operation policies keyed on `auth.uid() = user_id`, explicit GRANTs, an index on `user_id`, and — for date-scoped tables — a composite descending index on `(user_id, logged_at desc)` plus a DB-level not-future CHECK constraint (`workout_logs` needed a follow-up migration to add this; this plan adds it directly in the first migration instead).
- The established validation pattern (`src/lib/validation/training-plan.ts`) uses `z.coerce.number().int().positive()` for integer fields and a `.refine()` string-comparison (not `Date` `<=`) for the future-date check, avoiding the timezone-dependent off-by-one a `Date` comparison would introduce.
- The established route pattern (all 9 existing `/api/plans/**` routes): `context.locals.user` check first, `formData()` + zod `safeParse`, `createClient(context.request.headers, context.cookies)`, mutate + `.select()`, check `data.length === 0` to detect the RLS-silent-no-op case (not-found and not-owned collapse into the same code path), redirect on success or `?error=` on failure. No JSON responses anywhere.
- The established UI pattern (`/dashboard/plans/[id].astro`): a logging/creation form (date input defaulting to today via `new Date().toISOString().slice(0, 10)` computed in frontmatter), a history list below grouped by date in the frontmatter (`Map` keyed by date), each entry with inline query-param-driven edit (`?edit=<id>`) and a `DeleteConfirmButton` island for delete.
- `src/pages/dashboard.astro` has a single hardcoded nav link to `/dashboard/plans`; a second sibling link is the natural way to add a "Calories" entry.
- No existing table has a per-day uniqueness constraint — `workout_logs` (the only other date-scoped table) explicitly allows multiple same-date rows per user, grouped for display only.

### Key Discoveries:

- `workout_logs`' not-future date check was originally zod-only and needed a follow-up migration (`20260703170111_add_workout_logs_logged_at_not_future_check.sql`) to close a PostgREST-bypass gap — this plan adds the equivalent CHECK constraint directly in `calorie_logs`' first migration instead of deferring it.
- `calorie_logs` has no FK to any other owned table (unlike `exercises`→`training_plans` or `workout_logs`→`training_plans`/`exercises`), so its insert/update RLS policies need only the simple `auth.uid() = user_id` check — no parent-ownership `exists (...)` subquery is needed, unlike the pattern the `exercises` hardening migration had to add after the fact.
- No column needs GRANT-level immutability (unlike `workout_logs`' column-scoped UPDATE grant protecting `plan_id`/`exercise_id`) — `calorie_logs` has no denormalized/snapshotted fields, so a plain `grant select, insert, update, delete` suffices.

## What We're NOT Doing

- No single-total-per-day model — multiple entries per day are allowed and summed for display, matching the `workout_logs` precedent; no unique constraint on `(user_id, logged_at)`.
- No meal-type/food-name field — FR-006 only requires logging calories consumed, not itemized nutrition. A single `calories` integer per entry.
- No calorie-vs-goal comparison UI in this slice — that's S-06's job (weekly report), which needs S-03 (goals) to exist first anyway.
- No arbitrary sanity-check upper bound on the calorie value — matches the app's existing risk tolerance (e.g. workout weight also has no upper cap).
- No date-picker/filter UI — the page shows today's logging form plus the full history below, matching the plan-detail-page shape exactly.
- No changes to `/dashboard.astro` beyond adding one nav link.

## Implementation Approach

Three phases, mirroring `log-workout-against-plan`'s exact structure: a migration first (schema + RLS + GRANTs + not-future CHECK, all in one file since the workout_logs precedent showed the CHECK is worth adding immediately rather than as a follow-up), then form-POST API routes with zod validation, then the Astro UI reusing the plan-detail page's established conventions (inline query-param-driven forms, `DeleteConfirmButton`, date-grouped history).

## Phase 1: Data foundation — `calorie_logs` schema

### Overview

Create the `calorie_logs` table with RLS, GRANTs, and the not-future CHECK constraint all in one migration.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_calorie_logs_schema.sql` (stamp the real current timestamp per repo convention)

**Intent**: Add the `calorie_logs` table so a user can log one or more calorie entries per day, scoped to their own account, with no future-dated entries allowed at the DB layer from the start.

**Contract**: One table, `public.calorie_logs`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `calories integer not null check (calories > 0)`, `logged_at date not null default current_date check (logged_at <= current_date)`, `created_at timestamptz not null default now()`. Index on `user_id`; composite index on `(user_id, logged_at desc)` for the history query. `grant select, insert, update, delete on public.calorie_logs to authenticated;` (no column-scoping needed — no denormalized/immutable fields exist on this table). RLS enabled with the standard four `_own` policies (`select`/`insert`/`update`/`delete`), each `to authenticated`, keyed on `auth.uid() = user_id` only — no parent-ownership subquery needed since there's no FK to another owned table.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset`
- Type check passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- As user A, inserting a `calorie_logs` row for user B fails (RLS blocks it)
- As user A, inserting a future-dated entry fails at the DB layer (CHECK constraint), independent of any app-level validation
- Multiple entries on the same `logged_at` for the same user are all accepted (no uniqueness conflict)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: API routes — create, update, delete calorie entries

### Overview

Form-POST routes mirroring the `workout_logs` routes' shape, scoped directly under `/api/calories` since this table has no parent entity.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/validation/training-plan.ts` (or a new `src/lib/validation/calories.ts` — implementer's choice, following whichever the existing file's growing scope suggests at implementation time)

**Intent**: Add a zod schema for the calorie entry's user-editable fields, reusing the exact future-date refinement pattern already established for `workoutLogInputSchema`.

**Contract**: Export `calorieLogInputSchema`: `calories` (`z.coerce.number().int().positive()`), `logged_at` (`z.string().refine((value) => value <= new Date().toISOString().slice(0, 10), { message: "Date cannot be in the future" })`) — the same lexical ISO-string comparison already used for `workoutLogInputSchema.logged_at`, not a `Date` object comparison.

#### 2. Create route

**File**: `src/pages/api/calories/index.ts`

**Intent**: Insert a `calorie_logs` row for the current user.

**Contract**: `POST`, follows the exact structure of `src/pages/api/plans/index.ts` (auth check → form parse → zod validate → redirect with `?error=` on failure → insert with `.select().single()` → redirect to `/dashboard/calories` on success).

#### 3. Update route

**File**: `src/pages/api/calories/[id]/update.ts`

**Intent**: Update `calories`/`logged_at` on an existing entry the user owns.

**Contract**: `POST`, mirrors `src/pages/api/plans/[id]/logs/[logId]/update.ts`'s structure — parse form with `calorieLogInputSchema`, `update` on `calorie_logs` filtered `.eq("id", id)`, `.select()` + zero-rows check (RLS enforces ownership silently), redirect to `/dashboard/calories` with `?error=` on failure.

#### 4. Delete route

**File**: `src/pages/api/calories/[id]/delete.ts`

**Intent**: Delete a calorie entry the user owns.

**Contract**: `POST`, mirrors `src/pages/api/plans/[id]/logs/[logId]/delete.ts`'s structure exactly (delete filtered by id, `.select()` + zero-rows check, redirect back to `/dashboard/calories`).

### Success Criteria:

#### Automated Verification:

- Type check passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Submitting the log form with a future date redirects with an error and does not insert a row
- Submitting a valid calorie value creates a row visible only to the logging user
- Editing an entry updates only `calories`/`logged_at`
- Deleting an entry removes it and redirects back to `/dashboard/calories`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI — calories page, nav link, date-grouped history with daily totals

### Overview

New `/dashboard/calories` page: a logging form defaulting to today, and a history section below grouped by date (most recent first), each date group showing its entries plus a summed daily total, with inline edit and delete. A new nav link from `/dashboard.astro`.

### Changes Required:

#### 1. Calories page

**File**: `src/pages/dashboard/calories/index.astro` (new)

**Intent**: Give the user a single page to log today's calories and see their full history, following the exact shape of `/dashboard/plans/[id].astro`'s logging-form-plus-grouped-history pattern.

**Contract**: Server-side queries `calorie_logs` for the current user ordered `logged_at desc, created_at desc` (RLS scopes it automatically). Frontmatter computes `today` the same way as the plan detail page (`new Date().toISOString().slice(0, 10)`), used as the create form's default date value. Frontmatter groups fetched rows into a `Map` keyed by `logged_at` (same reduction pattern as the plan detail page's log grouping), and additionally computes each group's summed total (`entries.reduce((sum, e) => sum + e.calories, 0)`) for display next to that date's heading. Query param `?edit=<id>` reveals that entry's inline edit form in place of its read-only row, reusing the same ternary-per-row pattern. Each entry row includes a `DeleteConfirmButton` posting to the Phase 2 delete route. A "Back to dashboard" link matches the existing `/dashboard/plans` pages' convention.

#### 2. Dashboard nav link

**File**: `src/pages/dashboard.astro`

**Intent**: Give users a way to reach the new calories page.

**Contract**: Add one sibling `<a href="/dashboard/calories">` link next to the existing "Training plans" link, same class/styling.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- From `/dashboard`, the new "Calories" link navigates to `/dashboard/calories`
- Logging a calorie entry shows it in the history section grouped under today's date, with the date's total reflecting the new entry
- Logging a second entry on the same date shows both entries under one date heading with an updated total
- Editing and deleting an entry works in place, without navigating away
- Logging in as a second user shows no entries from the first user's account

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None yet at the time this plan is written. If `context/changes/testing-critical-path-integrity` (test-plan rollout Phase 1) has landed by the time this is implemented, its two-fixture-user harness and RLS/GRANT test pattern (`tests/integration/rls/*.test.ts`) should be extended with a `calorie-logs.test.ts` following the same shape — not written here since this plan predates that harness's completion.

### Integration Tests:

- N/A at plan time — see above.

### Manual Testing Steps:

1. Log in as user A, log two calorie entries for today with different values.
2. Confirm both appear under today's date heading with a correct summed total.
3. Edit one entry's value; confirm the total updates.
4. Delete one entry; confirm the total updates and the entry disappears.
5. Log an entry for a future date via direct form manipulation; confirm it's rejected both by the app (zod) and, if bypassed, by the DB CHECK constraint.
6. Log in as user B; confirm none of user A's entries are visible anywhere.

## Performance Considerations

None beyond existing patterns — `calorie_logs` is indexed on `(user_id, logged_at desc)` for the history query, matching the indexing already applied to `workout_logs`.

## Migration Notes

New table, no existing data to migrate.

## References

- Prior implementation (date-scoped log table precedent): `context/changes/log-workout-against-plan/plan.md`
- Prior implementation (first CRUD slice): `context/changes/create-and-manage-training-plan/plan.md`
- RLS/GRANT lesson: `context/foundation/lessons.md`
- Roadmap entry: `context/foundation/roadmap.md` (S-04)
- Validation conventions: `src/lib/validation/training-plan.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation — `calorie_logs` schema

#### Automated

- [ ] 1.1 Migration applies cleanly against local Supabase
- [ ] 1.2 Type check passes
- [ ] 1.3 Linting passes

#### Manual

- [ ] 1.4 Cross-user insert into `calorie_logs` is blocked by RLS
- [ ] 1.5 Future-dated entry rejected at the DB layer
- [ ] 1.6 Multiple same-date entries for one user are all accepted

### Phase 2: API routes — create, update, delete calorie entries

#### Automated

- [ ] 2.1 Type check passes
- [ ] 2.2 Linting passes

#### Manual

- [ ] 2.3 Future-dated `logged_at` is rejected with an error, no row inserted
- [ ] 2.4 Valid submission creates a row visible only to the logging user
- [ ] 2.5 Editing updates only calories/date
- [ ] 2.6 Deleting removes the entry and redirects back to the calories page

### Phase 3: UI — calories page, nav link, date-grouped history with daily totals

#### Automated

- [ ] 3.1 Type check passes
- [ ] 3.2 Linting passes

#### Manual

- [ ] 3.3 Nav link navigates to `/dashboard/calories`
- [ ] 3.4 Logging an entry shows it grouped under today's date with a correct total
- [ ] 3.5 A second same-date entry updates the group's total correctly
- [ ] 3.6 Inline edit and delete work without navigating away
- [ ] 3.7 A second user sees no entries from the first user's account
