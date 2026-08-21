# Log Weekly Body Measurements Implementation Plan

## Overview

Add a `body_measurements` domain table and the create/edit/delete/view flow for it, so a user can log their weight (required) plus optional body circumferences (waist, chest, hips, arms, thighs) on a self-paced weekly cadence. This closes FR-007 and is the last data-producing prerequisite for the future weekly report (S-06/FR-008).

## Current State Analysis

Three domain-logging slices already exist and establish a consistent, reusable pattern: `calorie_logs` (simple, full-CRUD, single required numeric field), `body_composition_goals` (append-only, single enum field), and `workout_logs` (full-CRUD, multiple required numeric fields, richer RLS). `calorie_logs` is the closest analog to this slice — same cadence philosophy (no enforcement), same CRUD shape, same date-CHECK pattern. This slice's only real departure from precedent is the number/optionality of numeric fields and the resulting need to distinguish "not provided" from "explicitly cleared" during edits, which no prior slice had to handle since every existing form field is required.

No date/week-boundary helper exists anywhere in the codebase (`src/lib` has no `date-utils.ts`); every date-aware feature so far (`calorie_logs`, `workout_logs`) stores a plain `logged_at date` and groups history by exact date string. This slice follows that same precedent and does not introduce week-bucketing — that's deferred to S-06, which doesn't exist yet.

## Desired End State

A logged-in user can, from `/dashboard`:
- See a "latest measurement" teaser (weight + date, or "not logged yet") and a nav link to `/dashboard/measurements`.
- On `/dashboard/measurements`: submit a new entry (weight required; waist/chest/hips/arms/thighs optional, in kg/cm) for any date up to and including today; see their full history grouped by exact logged date, newest first; edit or delete any of their own entries inline.
- Never see another user's measurement data, enforced at the RLS layer (verified manually with two seeded users, per the established pattern).

**Verification**: `npx supabase db reset` applies cleanly, `npm run build` and `npm run lint` pass, and the 13-ish manual checks in Progress below are confirmed live in-browser.

### Key Discoveries:

- `supabase/migrations/20260821094132_create_calorie_logs_schema.sql` — the exact schema/RLS/GRANT shape to replicate: `logged_at date not null default current_date check (logged_at <= current_date)` baked into the initial `CREATE TABLE` (not a follow-up patch, unlike `workout_logs`), plain `grant select, insert, update, delete on ... to authenticated` (no column-scoping needed since no denormalized/immutable columns), 4 RLS policies (`_select_own`/`_insert_own`/`_update_own`/`_delete_own`), all `auth.uid() = user_id`.
- `src/lib/validation/calories.ts:3-8` — the date-refine idiom to replicate verbatim: `z.string().refine((value) => value <= new Date().toISOString().slice(0, 10), { message: "Date cannot be in the future" })`.
- `src/pages/api/calories/index.ts`, `.../[id]/update.ts`, `.../[id]/delete.ts` — the exact API route shape (FormData-only, POST-only, auth check → parse+validate → Supabase-configured check → mutate → redirect with `?error=` on any failure, ownership enforced purely by RLS with a `data.length === 0` "not found" fallback on update/delete).
- `src/pages/dashboard/calories/index.astro` — the exact UI shape: `Map<string, Entry[]>` grouping by `logged_at`, `?edit=<id>` inline-edit toggle, shared `DeleteConfirmButton` from `@/components/plans/DeleteConfirmButton` (despite living under `components/plans/`, it's the generic delete-confirm component reused by `calories`).
- `src/lib/database.types.ts:22-183` — tables are strictly alphabetized (`body_composition_goals` → `calorie_logs` → `exercises` → `training_plans` → `workout_logs`); this file is hand-maintained, not CLI-generated. The prior slice's impl-review (`context/changes/log-daily-calories/reviews/impl-review.md`, F2) flagged a broken alphabetical insertion — `body_measurements` must be inserted between `body_composition_goals` and `calorie_logs` from the start.
- `context/foundation/lessons.md` — "Pair RLS with explicit GRANTs" rule: every `enable row level security` needs an explicit `grant ... to authenticated` in the same migration, verified against a real local Postgres instance.

## What We're NOT Doing

- No cadence enforcement — any number of entries per week is allowed, matching `calorie_logs`' precedent. "Weekly" is a UI/usage convention, not a database constraint.
- No week-boundary/ISO-week bucketing logic or `date-utils.ts` helper — deferred entirely to the future weekly-report slice (S-06), which doesn't exist yet and shouldn't be pre-built speculatively here.
- No unit selection (imperial/metric toggle) — everything is stored and displayed in kg/cm, no conversion logic, matching the app's existing lack of any i18n/unit handling.
- No user-defined custom measurement fields — the field set (weight, waist, chest, hips, arms, thighs) is fixed by this plan, not user-configurable.
- No pagination on the history list — matches the existing gap already accepted in `calorie_logs` and `dashboard/plans/[id].astro` (noted, not fixed, in `log-daily-calories`'s impl-review F4).
- No changes to `dashboard/plans/[id].astro`, `calorie_logs`, or any other existing table/route beyond the new nav link and teaser card on `dashboard.astro`.

## Implementation Approach

Replicate the `calorie_logs` slice's structure exactly (schema → API → UI, 3 phases), with two deliberate deltas: (1) five of the six numeric fields are optional, and (2) the dashboard hub page gains a small "latest measurement" teaser query, mirroring the existing goal teaser on the same page.

## Critical Implementation Details

### State sequencing: optional-field clearing must produce `null`, not an omitted key

Every prior form in this app has only required fields, so this is the first form where a field can go from "has a value" to "blank" across an edit. If the validation schema simply drops empty optional fields (mapping `""` → `undefined`), Supabase's client will omit that key from the JSON body entirely — which means an UPDATE leaves the column untouched instead of clearing it, silently failing to honor a user unsetting a previously-logged circumference.

The fix: each optional field's zod schema must resolve blank input to an explicit `null` (never `undefined`), so the same schema works correctly for both INSERT (explicit `null` is equivalent to omission — the column allows `null`) and UPDATE (explicit `null` actually clears the column). Use:

```ts
const optionalMeasurement = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : val),
  z.union([z.null(), z.coerce.number().positive()]),
);
```

Apply this to `waist`, `chest`, `hips`, `arms`, `thighs`. `weight` stays a plain required `z.coerce.number().positive()`, matching the `calories` field precedent.

## Phase 1: Data foundation — `body_measurements` schema

### Overview

Create the table, its RLS/GRANT pair, and the corresponding `database.types.ts` entry, following `calorie_logs`' exact structure.

### Changes Required:

#### 1. Migration: `body_measurements` schema

**File**: `supabase/migrations/20260821140000_create_body_measurements_schema.sql`

**Intent**: Define the table, indexes, GRANT, and RLS policies for storing a user's weekly body-measurement entries.

**Contract**: Columns: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `weight numeric(5,2) not null check (weight > 0)`, `waist numeric(5,2) check (waist > 0)`, `chest numeric(5,2) check (chest > 0)`, `hips numeric(5,2) check (hips > 0)`, `arms numeric(5,2) check (arms > 0)`, `thighs numeric(5,2) check (thighs > 0)`, `logged_at date not null default current_date check (logged_at <= current_date)`, `created_at timestamptz not null default now()`. Two indexes mirroring `calorie_logs`: `body_measurements_user_id_idx(user_id)` and `body_measurements_user_id_logged_at_idx(user_id, logged_at desc)`. One plain `grant select, insert, update, delete on public.body_measurements to authenticated;` (no column-scoping needed — no denormalized/immutable columns exist here). Four RLS policies named `body_measurements_select_own` / `_insert_own` / `_update_own` / `_delete_own`, all `to authenticated`, all `using`/`with check (auth.uid() = user_id)` — copy `calorie_logs`' policy bodies verbatim, renaming only the policy/table names.

#### 2. `database.types.ts` entry

**File**: `src/lib/database.types.ts`

**Intent**: Add typed `Row`/`Insert`/`Update`/`Relationships` for `body_measurements` so the Supabase client calls in later phases are type-checked.

**Contract**: Insert the `body_measurements` block alphabetically **between** `body_composition_goals` (ends line 43) and `calorie_logs` (starts line 44) — this exact placement was called out as a review finding on the prior slice and must not be repeated. Fields within `Row`/`Insert`/`Update` alphabetized per the existing convention: `arms`, `chest`, `created_at`, `hips`, `id`, `logged_at`, `thighs`, `user_id`, `waist`, `weight`. `arms`/`chest`/`hips`/`thighs`/`waist` are `number | null` in `Row` and optional-nullable (`field?: number | null`) in `Insert`/`Update`; `weight` is required `number` in `Row`/`Insert`, optional in `Update`; `logged_at`/`created_at`/`id` follow the same optional-in-Insert pattern as `calorie_logs`. `Relationships: []` (no FKs).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Type checking / build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- As user A, inserting a row directly (or via a temporary test call) with user B's `user_id` is rejected by RLS.
- A `logged_at` value in the future is rejected by the CHECK constraint.
- Two entries for the same user on the same date are both accepted (no cadence enforcement at the DB layer).
- An entry with only `weight` set (all circumference fields `null`) is accepted.

---

## Phase 2: API routes — create, update, delete measurement entries

### Overview

Add the FormData-driven mutation routes, following the `calories` route trio exactly, plus the shared validation schema with the null-clearing behavior described above.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/validation/measurements.ts`

**Intent**: Validate and coerce form input for a measurement entry, enforcing the not-future-date rule and the explicit-null-on-blank behavior for optional fields.

**Contract**: Export `measurementLogInputSchema = z.object({ weight, waist, chest, hips, arms, thighs, logged_at })` where `weight` is `z.coerce.number().positive()`, each of `waist`/`chest`/`hips`/`arms`/`thighs` uses the `optionalMeasurement` preprocess-to-null pattern from Critical Implementation Details, and `logged_at` reuses the exact not-future refine from `src/lib/validation/calories.ts:5-7`.

#### 2. Create route

**File**: `src/pages/api/measurements/index.ts`

**Intent**: Insert a new measurement entry for the authenticated user.

**Contract**: `export const POST: APIRoute`, same shape as `src/pages/api/calories/index.ts` — auth check → `formData()` → `measurementLogInputSchema.safeParse({...})` reading all six form fields + `logged_at` → Supabase-configured check → `.from("body_measurements").insert({ ...parsed.data, user_id })` → redirect to `/dashboard/measurements` on success, `/dashboard/measurements?error=...` on any failure.

#### 3. Update route

**File**: `src/pages/api/measurements/[id]/update.ts`

**Intent**: Update an existing measurement entry the user owns.

**Contract**: Same shape as `src/pages/api/calories/[id]/update.ts` — `id` param guard → auth check → parse/validate → `.from("body_measurements").update(parsed.data).eq("id", id).select()` → `data.length === 0` treated as not-found/not-owned → redirect to `/dashboard/measurements` (with `?error=` on failure).

#### 4. Delete route

**File**: `src/pages/api/measurements/[id]/delete.ts`

**Intent**: Delete a measurement entry the user owns.

**Contract**: Same shape as `src/pages/api/calories/[id]/delete.ts` — `id` param guard → auth check → `.from("body_measurements").delete().eq("id", id).select()` → same not-found fallback → redirect to `/dashboard/measurements`.

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Submitting a future `logged_at` is rejected with the generic error redirect.
- Submitting only `weight` (all circumference fields left blank) creates a valid entry.
- Creating an entry with all six fields filled succeeds and all values are stored correctly.
- Editing an entry to blank out a previously-set circumference field actually clears it to `null` (not left unchanged) — this is the specific edge case Critical Implementation Details calls out.
- Deleting an entry removes it from the list.
- A logged-in user cannot update/delete another user's entry (verified via direct API call with a foreign `id`, expecting the not-found redirect).

---

## Phase 3: UI — measurements page, nav link, dashboard teaser

### Overview

Add the dashboard sub-page (form + grouped history + inline edit/delete), wire it into the dashboard hub's nav row, and add a "latest measurement" teaser card to `dashboard.astro`.

### Changes Required:

#### 1. Measurements page

**File**: `src/pages/dashboard/measurements/index.astro`

**Intent**: Let the user submit a new entry and view/edit/delete their history, grouped by exact logged date — same structure as `src/pages/dashboard/calories/index.astro`.

**Contract**: Frontmatter reads `error`/`edit` from `Astro.url.searchParams`, computes `today` via `new Date().toISOString().slice(0, 10)`, fetches `body_measurements` rows (`select("id, weight, waist, chest, hips, arms, thighs, logged_at")`, ordered `logged_at desc, created_at desc`), groups into `Map<string, Entry[]>` by `logged_at`. Create form: `weight` required number input plus five optional number inputs (`waist`/`chest`/`hips`/`arms`/`thighs`, no `required` attribute, blank-able) and the `logged_at` date input, `method="POST" action="/api/measurements"`. History rendering: for each date group, render each entry as either the inline edit form (`entry.id === editingId`, prefilled with `value={entry.waist ?? ""}` etc. for optional fields so a null renders as an empty input) posting to `/api/measurements/${entry.id}/update`, or a display row showing weight prominently plus any non-null circumference values, an `Edit` link (`?edit=${id}`), and `<DeleteConfirmButton client:load action={`/api/measurements/${entry.id}/delete`} itemLabel={`${entry.weight} kg`} />`. Same `Layout`/back-link/`ServerError` wrapper as `calories/index.astro`.

#### 2. Dashboard hub — nav link + latest-measurement teaser

**File**: `src/pages/dashboard.astro`

**Intent**: Surface the user's most recent measurement at a glance and link into the full measurements page, mirroring the existing goal teaser on the same page.

**Contract**: Add a query fetching the latest `body_measurements` row (`select("weight, logged_at")`, ordered `logged_at desc, created_at desc`, `.limit(1).maybeSingle()`), same pattern as the existing `body_composition_goals` query at `dashboard.astro:9-16`. Render a line analogous to the existing `Goal: ...` line (e.g. `Latest measurement: {measurement ? `${measurement.weight} kg (${measurement.logged_at})` : "Not logged yet"}`) right after it. Add a fourth nav `<a href="/dashboard/measurements" ...>` card into the existing `flex flex-wrap items-center justify-center gap-3` row (`dashboard.astro:32`), styled identically to the `Calories` link.

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- The dashboard hub shows "Not logged yet" for a fresh user, then shows the correct weight/date after logging one entry.
- The `Measurements` nav link navigates to `/dashboard/measurements`.
- History correctly groups multiple same-day entries under one date heading.
- A second user's dashboard/measurements page never shows the first user's entries (cross-user isolation, browser-verified with two accounts).
- Inline edit prefills all fields correctly (blank for null optional fields) and Cancel returns to the plain view without saving.

---

## Testing Strategy

### Unit Tests:

- None planned — no unit test rollout phase exists yet for this codebase (`context/foundation/test-plan.md` §3 has no phase covering domain-table CRUD logic beyond the Phase-1 integration harness, which this plan doesn't extend).

### Integration Tests:

- None added by this plan — matches the precedent set by `log-daily-calories` and `set-body-composition-goal`, which also shipped without new automated integration tests. `context/foundation/test-plan.md` §3 Phase 1 (`testing-critical-path-integrity`) already covers ownership/RLS/authorization patterns generically; this plan doesn't add a new automated case there.

### Manual Testing Steps:

1. Log an entry with only weight filled; confirm it saves and displays with no circumference values shown.
2. Log an entry with all six fields filled; confirm all values display correctly in history.
3. Edit an entry to clear a previously-set circumference field; confirm it's actually cleared (not left stale).
4. Attempt a future-dated entry; confirm rejection with the generic error banner.
5. Log two entries on the same date; confirm both appear grouped under one date heading.
6. Verify cross-user isolation on both the measurements page and the dashboard teaser, using two seeded accounts.

## Performance Considerations

None beyond the existing app-wide pattern — small per-user row counts, no pagination needed at MVP scale (same accepted gap as `calorie_logs`).

## Migration Notes

New table, no existing data to migrate.

## References

- Similar implementation: `context/changes/log-daily-calories/plan.md`, `supabase/migrations/20260821094132_create_calorie_logs_schema.sql`, `src/pages/dashboard/calories/index.astro`
- RLS/GRANT rule: `context/foundation/lessons.md`
- Prior review finding on `database.types.ts` ordering: `context/changes/log-daily-calories/reviews/impl-review.md` (F2)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation — `body_measurements` schema

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 Build passes: `npm run build`
- [x] 1.3 Lint passes: `npm run lint`

#### Manual

- [ ] 1.4 Cross-user RLS insert rejection verified
- [ ] 1.5 Future-date CHECK rejection verified
- [ ] 1.6 Multiple same-day entries accepted
- [ ] 1.7 Weight-only entry (all circumferences null) accepted

### Phase 2: API routes — create, update, delete measurement entries

#### Automated

- [x] 2.1 Build passes: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 Future-date submission rejected
- [ ] 2.4 Weight-only creation succeeds
- [ ] 2.5 Full six-field creation succeeds
- [ ] 2.6 Clearing an optional field on edit actually nulls it out
- [ ] 2.7 Delete removes the entry
- [ ] 2.8 Cross-user update/delete rejected (not-found redirect)

### Phase 3: UI — measurements page, nav link, dashboard teaser

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Dashboard teaser shows "Not logged yet" then correct latest entry
- [ ] 3.4 Nav link navigates to `/dashboard/measurements`
- [ ] 3.5 Same-day entries grouped under one heading
- [ ] 3.6 Cross-user isolation verified on page and teaser
- [ ] 3.7 Inline edit prefill/cancel behaves correctly
