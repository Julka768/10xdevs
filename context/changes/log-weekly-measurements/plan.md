# Log Weekly Body Measurements Implementation Plan

## Overview

Add a `body_measurements` domain table and the create/edit/delete/view flow for it, so a user can log their weight (required) plus optional body circumferences (waist, chest, hips, arms, thighs) on a self-paced weekly cadence. This closes FR-007 and is the last data-producing prerequisite for the future weekly report (S-06/FR-008).

**Extension (Phases 4-6, added after Phases 1-3 shipped):** manual testing of the Phase 1-3 baseline surfaced a real scope gap — the user also wants the ability to add their own custom measurement types (and rename/delete them), beyond the 6 built-in fields. Phases 4-6 add this additively, without reworking the already-shipped fixed-column schema or its API/UI.

## Current State Analysis

Three domain-logging slices already exist and establish a consistent, reusable pattern: `calorie_logs` (simple, full-CRUD, single required numeric field), `body_composition_goals` (append-only, single enum field), and `workout_logs` (full-CRUD, multiple required numeric fields, richer RLS). `calorie_logs` is the closest analog to this slice — same cadence philosophy (no enforcement), same CRUD shape, same date-CHECK pattern. This slice's only real departure from precedent is the number/optionality of numeric fields and the resulting need to distinguish "not provided" from "explicitly cleared" during edits, which no prior slice had to handle since every existing form field is required.

No date/week-boundary helper exists anywhere in the codebase (`src/lib` has no `date-utils.ts`); every date-aware feature so far (`calorie_logs`, `workout_logs`) stores a plain `logged_at date` and groups history by exact date string. This slice follows that same precedent and does not introduce week-bucketing — that's deferred to S-06, which doesn't exist yet.

## Desired End State

A logged-in user can, from `/dashboard`:
- See a "latest measurement" teaser (weight + date, or "not logged yet") and a nav link to `/dashboard/measurements`.
- On `/dashboard/measurements`: submit a new entry (weight required; waist/chest/hips/arms/thighs optional, in kg/cm) for any date up to and including today; see their full history grouped by exact logged date, newest first; edit or delete any of their own entries inline.
- Never see another user's measurement data, enforced at the RLS layer (verified manually with two seeded users, per the established pattern).
- Add, rename, and delete their own custom measurement types (up to 10), and see values for those types alongside the 6 built-in fields everywhere the built-ins appear (log form, edit form, history).

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
- ~~No user-defined custom measurement fields~~ — superseded by Phases 4-6 (see extension note in Overview). The 6 built-in fields (weight, waist, chest, hips, arms, thighs) remain fixed columns with fixed names; custom types are strictly additive.
- No renaming of the 6 built-in fields — only user-added custom types can be renamed, per explicit user decision during the Phase 4-6 planning round.
- No promoting weight (or any built-in) into the flexible type system — weight stays a required, fixed column exactly as shipped in Phase 1.
- No snapshot/preservation of a custom type's logged values after the type itself is deleted — deleting a `measurement_types` row cascades and removes all its `measurement_values` rows, matching the simplest-possible-cascade precedent (no "preserve history" requirement was raised for this, unlike `workout_logs`' exercise-deletion snapshot).
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

### FK-ownership validation in `measurement_values` RLS (Phase 4)

Unlike every other table in this plan, `measurement_values` rows reference two other user-owned tables (`body_measurements` via `measurement_id`, `measurement_types` via `type_id`). A plain `auth.uid() = user_id` insert policy is not enough here: a malicious request could submit its own `user_id` alongside another user's `measurement_id` or `type_id`, silently attaching a value to someone else's entry or type. `workout_logs` already solved this exact problem for `plan_id`/`exercise_id` with `exists` subqueries in its insert policy (`supabase/migrations/20260703161941_create_workout_logs_schema.sql`) — replicate that shape here rather than relying on `auth.uid() = user_id` alone.

### Upsert-or-delete semantics for custom values (Phase 5)

Custom-type values aren't columns that can hold `null` — a "cleared" custom field means the corresponding `measurement_values` row should not exist at all. So the create/update routes must, per submitted custom type: **upsert** (insert or update) when a non-blank value is submitted, and **delete** the row (if one exists) when the field is blank. This is a different mechanism from the Phase 2 null-clearing pattern (which relies on nullable columns) — there is no column here to null out.

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

## Phase 4: Data foundation — custom measurement types

### Overview

Add `measurement_types` (a user-owned catalog of custom field names) and `measurement_values` (the per-entry values for those types), additively alongside the existing fixed-column `body_measurements` table. Update `database.types.ts` accordingly.

### Changes Required:

#### 1. Migration: `measurement_types` and `measurement_values` schema

**File**: `supabase/migrations/20260821160000_create_measurement_types_schema.sql`

**Intent**: Let each user define their own named measurement types, and store per-entry values against those types, without touching the Phase 1 `body_measurements` schema.

**Contract**: `measurement_types`: `id uuid pk`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null check (length(trim(name)) > 0)`, `created_at timestamptz not null default now()`. Index on `user_id`. Plain `grant select, insert, update, delete ... to authenticated`. Four RLS policies (`_select_own`/`_insert_own`/`_update_own`/`_delete_own`), all `auth.uid() = user_id` — same shape as `body_measurements`.

`measurement_values`: `id uuid pk`, `user_id uuid not null references auth.users(id) on delete cascade`, `measurement_id uuid not null references public.body_measurements(id) on delete cascade`, `type_id uuid not null references public.measurement_types(id) on delete cascade`, `value numeric(5,2) not null check (value > 0)`, `created_at timestamptz not null default now()`, `unique (measurement_id, type_id)` (one value per type per entry). Indexes on `user_id` and `measurement_id`. Plain grant, same 4-policy RLS shape for select/update/delete, **but** the insert (and update) policy's `with check` must also verify `measurement_id` and `type_id` belong to the same `auth.uid()`, per the Critical Implementation Details note above — replicate `workout_logs`' `exists`-subquery insert-policy shape (`supabase/migrations/20260703161941_create_workout_logs_schema.sql:31-46`), checking against `body_measurements` and `measurement_types` instead of `training_plans`/`exercises`.

#### 2. `database.types.ts` entries

**File**: `src/lib/database.types.ts`

**Intent**: Type the two new tables so later phases' Supabase calls are type-checked.

**Contract**: Insert `measurement_types` and `measurement_values` alphabetically between `exercises` and `training_plans` (`t` < `v`, so `measurement_types` precedes `measurement_values`). Both need `Relationships` arrays populated with their FK objects (`measurement_values` has two: `measurement_id` → `body_measurements`, `type_id` → `measurement_types`), following the `workout_logs` `Relationships` shape as the template for a multi-FK table.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- User A cannot insert a `measurement_values` row pointing at user B's `measurement_id` or `type_id`, even when `user_id` is set to A's own id.
- Deleting a `measurement_types` row cascades and removes its `measurement_values` rows.
- Two values for the same `(measurement_id, type_id)` pair are rejected by the unique constraint.

---

## Phase 5: API routes — manage custom types, extend measurement create/update

### Overview

Add CRUD routes for `measurement_types`, and extend the existing `/api/measurements` create/update routes to upsert-or-delete `measurement_values` rows for whichever custom types were submitted.

### Changes Required:

#### 1. Validation schema addition

**File**: `src/lib/validation/measurements.ts`

**Intent**: Validate a custom type's name on create/rename, and validate an individual custom value the same way an optional built-in field is validated.

**Contract**: Export `measurementTypeInputSchema = z.object({ name: z.string().trim().min(1) })`. Export a single-field validator (reuse the existing `optionalMeasurement` shape from Critical Implementation Details) for validating one custom value at a time, since custom fields are keyed by dynamic type IDs rather than fixed object keys.

#### 2. Custom type CRUD routes

**Files**: `src/pages/api/measurement-types/index.ts` (create), `src/pages/api/measurement-types/[id]/update.ts` (rename), `src/pages/api/measurement-types/[id]/delete.ts` (delete)

**Intent**: Let a user add, rename, and delete their own custom measurement types.

**Contract**: Same shape as the `calories` route trio (auth check → parse → Supabase-configured check → mutate → redirect to `/dashboard/measurements`, `?error=` on failure). The create route additionally counts the user's existing `measurement_types` rows first and rejects with an error redirect (`"You can only add up to 10 custom measurement types"`) if the count is already 10 — enforced in the route, not the database (no other table in this codebase uses a DB-level row-count constraint or trigger).

#### 3. Extend measurement create/update routes

**Files**: `src/pages/api/measurements/index.ts`, `src/pages/api/measurements/[id]/update.ts`

**Intent**: After the existing `body_measurements` insert/update succeeds, process any submitted custom-type fields (form field names `custom_<type_id>`) against the user's own `measurement_types`, upserting or deleting `measurement_values` rows per the Critical Implementation Details note above.

**Contract**: Fetch the user's `measurement_types` (id, name) first, so only known-owned type IDs are processed (ignore any `custom_<type_id>` field whose `type_id` isn't in that set — defends against a forged field name). For each owned type: blank/missing submitted value → delete any existing `measurement_values` row for `(measurement_id, type_id)`; non-blank valid value → attempt `.update({ value }).eq("measurement_id", measurementId).eq("type_id", typeId)` first, and `.insert({ measurement_id, type_id, value, user_id })` only if that update affected zero rows. **Do not use `.upsert()` here** — Phase 4's `measurement_values` update GRANT is column-scoped to `value` only (mirroring `workout_logs`' immutable-columns pattern), and Supabase's upsert emits an `ON CONFLICT DO UPDATE SET` clause covering every column in the payload (including `measurement_id`/`type_id`/`user_id`), which Postgres rejects against a column-scoped grant even when those values are unchanged. The explicit update-then-insert-if-absent avoids ever referencing those columns in an UPDATE. On the create route, `measurement_id` is the newly-inserted `body_measurements` row's `id`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Adding an 11th custom type is rejected with the limit error.
- Renaming a custom type updates its label without affecting already-logged values.
- Deleting a custom type removes it from the log form and its historical values disappear from history.
- Logging an entry with a value for a custom type creates the corresponding `measurement_values` row.
- Editing an entry to blank out a previously-set custom value deletes that `measurement_values` row (not left stale).
- A forged `custom_<foreign-type-id>` field in the form POST is silently ignored, not stored.

---

## Phase 6: UI — manage custom types, dynamic fields in log form and history

### Overview

Add a small "your custom measurement types" management panel to `/dashboard/measurements` (add/rename/delete), and render one input per custom type in the log/edit forms and history display, alongside the existing 6 built-in fields.

### Changes Required:

#### 1. Custom-types management panel + dynamic form fields

**File**: `src/pages/dashboard/measurements/index.astro`

**Intent**: Let the user manage their custom types and fill in values for them when logging or editing an entry, and see those values in history.

**Contract**: Frontmatter fetches the user's `measurement_types` (ordered by `created_at`) and, for history rendering, their `measurement_values` joined/grouped by `measurement_id`. Management panel: a list of existing custom types, each with an inline rename form (`?edit_type=<id>` toggle, same pattern as entry inline-edit) posting to `/api/measurement-types/[id]/update`, and a `DeleteConfirmButton` posting to `/api/measurement-types/[id]/delete`; plus an "Add type" form (name input) posting to `/api/measurement-types`. Log form: after the 5 built-in optional fields, render one additional optional number input per custom type, `name={`custom_${type.id}`}`, labeled with `type.name`. Edit form: same additional inputs, prefilled from that entry's `measurement_values` (blank if no value exists for that type). History rows: alongside the existing built-in-value line, append any custom-type values in the same `"Label: value"` joined-string style.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Adding a custom type makes a new input appear in the log form immediately (after page reload/redirect).
- Renaming a custom type updates its label everywhere it appears (form, history) without needing to re-log anything.
- Deleting a custom type removes its input from the form and its values from history.
- Logging and editing entries with custom values round-trips correctly through the UI.
- A second user never sees the first user's custom types or values.

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

New tables, no existing data to migrate. Phases 4-6 are purely additive on top of Phases 1-3 — no existing `body_measurements` rows or columns are altered.

## References

- Similar implementation: `context/changes/log-daily-calories/plan.md`, `supabase/migrations/20260821094132_create_calorie_logs_schema.sql`, `src/pages/dashboard/calories/index.astro`
- RLS/GRANT rule: `context/foundation/lessons.md`
- Prior review finding on `database.types.ts` ordering: `context/changes/log-daily-calories/reviews/impl-review.md` (F2)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation — `body_measurements` schema

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — bdc0016
- [x] 1.2 Build passes: `npm run build` — bdc0016
- [x] 1.3 Lint passes: `npm run lint` — bdc0016

#### Manual

- [x] 1.4 Cross-user RLS insert rejection verified — bdc0016
- [x] 1.5 Future-date CHECK rejection verified — bdc0016
- [x] 1.6 Multiple same-day entries accepted — bdc0016
- [x] 1.7 Weight-only entry (all circumferences null) accepted — bdc0016

### Phase 2: API routes — create, update, delete measurement entries

#### Automated

- [x] 2.1 Build passes: `npm run build` — fbc6e67
- [x] 2.2 Lint passes: `npm run lint` — fbc6e67

#### Manual

- [x] 2.3 Future-date submission rejected — fbc6e67
- [x] 2.4 Weight-only creation succeeds — fbc6e67
- [x] 2.5 Full six-field creation succeeds — fbc6e67
- [x] 2.6 Clearing an optional field on edit actually nulls it out — fbc6e67
- [x] 2.7 Delete removes the entry — fbc6e67
- [x] 2.8 Cross-user update/delete rejected (not-found redirect) — fbc6e67

### Phase 3: UI — measurements page, nav link, dashboard teaser

#### Automated

- [x] 3.1 Build passes: `npm run build` — 5ecf902
- [x] 3.2 Lint passes: `npm run lint` — 5ecf902

#### Manual

- [x] 3.3 Dashboard teaser shows "Not logged yet" then correct latest entry — 5ecf902
- [x] 3.4 Nav link navigates to `/dashboard/measurements` — 5ecf902
- [x] 3.5 Same-day entries grouped under one heading — 5ecf902
- [x] 3.6 Cross-user isolation verified on page and teaser — 5ecf902
- [x] 3.7 Inline edit prefill/cancel behaves correctly — 5ecf902

### Phase 4: Data foundation — custom measurement types

#### Automated

- [x] 4.1 Migration applies cleanly: `npx supabase db reset` — 742ffc6
- [x] 4.2 Build passes: `npm run build` — 742ffc6
- [x] 4.3 Lint passes: `npm run lint` — 742ffc6

#### Manual

- [x] 4.4 Cross-user FK-forgery insert into `measurement_values` rejected — 742ffc6
- [x] 4.5 Deleting a `measurement_types` row cascades to its `measurement_values` — 742ffc6
- [x] 4.6 Duplicate `(measurement_id, type_id)` value rejected by unique constraint — 742ffc6

### Phase 5: API routes — manage custom types, extend measurement create/update

#### Automated

- [x] 5.1 Build passes: `npm run build` — 52bf507
- [x] 5.2 Lint passes: `npm run lint` — 52bf507

#### Manual

- [x] 5.3 11th custom type rejected with limit error — 52bf507
- [x] 5.4 Renaming a custom type doesn't affect existing values — 52bf507
- [x] 5.5 Deleting a custom type removes it from the form and its historical values — 52bf507
- [x] 5.6 Logging a custom value creates a `measurement_values` row — 52bf507
- [x] 5.7 Clearing a custom value on edit deletes its row — 52bf507
- [x] 5.8 Forged foreign `custom_<type-id>` field is ignored — 52bf507

### Phase 6: UI — manage custom types, dynamic fields in log form and history

#### Automated

- [x] 6.1 Build passes: `npm run build` — cdfe8e1
- [x] 6.2 Lint passes: `npm run lint` — cdfe8e1

#### Manual

- [x] 6.3 Adding a custom type shows a new input in the log form — cdfe8e1
- [x] 6.4 Renaming updates the label everywhere without re-logging — cdfe8e1
- [x] 6.5 Deleting removes the input and its history values — cdfe8e1
- [x] 6.6 Logging/editing custom values round-trips correctly through the UI — cdfe8e1
- [x] 6.7 Cross-user isolation verified for custom types and values — cdfe8e1
