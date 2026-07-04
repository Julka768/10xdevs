# Set Body-Composition Goal Implementation Plan

## Overview

Let a logged-in user set and edit a body-composition goal (lose / gain / maintain weight) at any time (FR-004), independent of the training-plan/exercise/workout-log domain built in F-01/S-01/S-02.

## Current State Analysis

No `goal`-related table, route, or page exists yet. `training_plans`, `exercises`, and `workout_logs` all follow the same three-layer pattern (migration → form-POST API route → server-rendered Astro page), but none of them model a single logical value per user — they're all lists (multiple plans, multiple exercises, multiple logs). This is the first slice that needs a "what's the current value" read pattern.

`src/pages/dashboard.astro` is a minimal landing shell (welcome message, link to `/dashboard/plans`, sign-out form) — no Supabase query runs there today. `src/components/ui/` has `button`, `card`, `input`, `label`, `alert-dialog` — no `select` or `radio-group` component. Every existing form is plain server-rendered HTML with no `client:*` directive except `DeleteConfirmButton.tsx`.

### Key Discoveries:

- RLS + GRANT pattern established in `supabase/migrations/20260703121505_create_training_plan_schema.sql:1-30` (select/insert/update/delete policies, explicit `grant select, insert, update, delete ... to authenticated`) — see `context/foundation/lessons.md` ("Pair RLS with explicit GRANTs").
- Every mutation route follows the same shape: check `context.locals.user`, read `context.request.formData()`, validate with a zod schema from `src/lib/validation/*.ts`, redirect on success to the page, redirect with `?error=<msg>` on failure (e.g. `src/pages/api/plans/[id]/exercises/[exerciseId]/update.ts:20-22`). Error redirects do **not** preserve any `?edit=` query param — the form closes back to read-only view on error, same as success.
- No route in the codebase uses `.upsert()` — all existing mutations are plain insert/update/delete (`src/pages/api/plans/**`).
- Zod schemas live in one shared file per domain area, e.g. `src/lib/validation/training-plan.ts` (holds `planNameSchema`, `exerciseInputSchema`, and S-02's `workoutLogInputSchema` together, since they're all training-plan-adjacent). A goal is a separate domain, so it gets its own `src/lib/validation/goal.ts`.

## Desired End State

A user visits `/dashboard/goal`. If no goal is set, they see an empty-state form (no option pre-selected) with a "No goal set yet" message. Choosing lose/gain/maintain and submitting creates the goal and shows it back as a read-only "Current goal: …" view with an "Edit" link. Clicking Edit reopens the form pre-selected to the current value; submitting a new value updates what's displayed. `dashboard.astro`'s shell also shows the current goal (or a "not set" indicator) with a link to `/dashboard/goal`.

Every "set" or "edit" action is a plain insert into an append-only history table — no row is ever updated or deleted. "Current goal" is always defined as the most recent row for that user.

### Key Discoveries:

- (see Current State Analysis above)

## What We're NOT Doing

- No target-weight or magnitude field — only the `lose` / `gain` / `maintain` direction enum, per FR-004's literal scope and the roadmap's explicit scope-creep warning.
- No UI to browse the full goal-change history — only the current (latest) value is surfaced in this slice. The history table exists for future use (e.g. S-06) but has no dedicated "history" page here.
- No update or delete of goal rows, ever — editing always appends a new row.
- No rate limiting or confirmation step on how often a user changes their goal.
- No changes to `Topbar.astro` — visibility is limited to `/dashboard/goal` and the `dashboard.astro` shell.

## Implementation Approach

Same three-layer pattern as F-01/S-01/S-02: Supabase migration (schema + RLS + GRANTs) → one form-POST API route with zod validation → Astro UI. The new wrinkle is that this is an append-only, single-current-value entity rather than a CRUD list, so the table gets `select`+`insert` RLS policies only (no `update`/`delete` policies — default-deny handles those), and every read site fetches "current" via `order(created_at desc).limit(1)`.

## Critical Implementation Details

- **Append-only model, not upsert**: unlike a typical "settings" table, this one has no unique constraint on `user_id` and no update path. Setting or editing a goal is always a plain `insert`. The "current goal" is derived, not stored — every place that needs it (goal page, dashboard shell) queries the same way: latest row by `created_at` for the authenticated user. Don't special-case one of these two read sites to compute "current" differently.
- **No select/radio component exists yet**: `src/components/ui/` has no shadcn `select` or `radio-group`. Use plain native HTML radio inputs (three, one per enum value) styled with Tailwind to match the existing dark-glass aesthetic — no `client:*` directive needed since the form is a plain POST, no shadcn component installation required for this.

## Phase 1: Data foundation — `body_composition_goals` schema

### Overview

Create the append-only goals table with ownership-scoped RLS from the start (S-01's `exercises` table needed a follow-up hardening migration — this phase applies that lesson immediately rather than retrofitting).

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260704000000_create_body_composition_goals_schema.sql`

**Intent**: Store each goal-setting action as its own immutable row scoped to the owning user; "current goal" is the most recent row per `user_id`.

**Contract**: `body_composition_goals(id uuid pk, user_id uuid not null references auth.users(id) on delete cascade, goal_type text not null check (goal_type in ('lose','gain','maintain')), created_at timestamptz not null default now())`, index on `(user_id, created_at desc)` for the "latest per user" lookup. RLS: `select` and `insert` policies scoped to `auth.uid() = user_id` only — no `update`/`delete` policies (default-deny). GRANT: `select, insert` only, to `authenticated` (deliberately omit `update`/`delete` GRANTs to match the no-mutation-after-insert design).

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly against local Supabase
- [ ] Type checking passes: `npm run build` (or `astro check` if wired into it)
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Cross-user `select` of `body_composition_goals` is blocked by RLS
- [ ] Insert with another user's `user_id` is rejected by the insert policy
- [ ] A user can insert multiple rows (repeated goal changes) without any uniqueness conflict
- [ ] Attempting an `update` or `delete` against the table (e.g. via `psql`) is denied — no policy exists for either operation

---

## Phase 2: API route — create a goal entry

### Overview

One route that always inserts a new row; no update/delete routes exist for this entity.

### Changes Required:

#### 1. Zod schema

**File**: `src/lib/validation/goal.ts`

**Intent**: Validate the submitted goal direction against the same three literal values as the DB check constraint.

**Contract**: exports `goalInputSchema = z.object({ goal_type: z.enum(["lose", "gain", "maintain"]) })`.

#### 2. API route

**File**: `src/pages/api/goal/create.ts`

**Intent**: Insert a new goal row for the authenticated user; this is the single write path for both first-time set and later edits.

**Contract**: `POST` handler following the established shape (`context.locals.user` check → redirect to `/auth/signin` if absent; `context.request.formData()` → `goalInputSchema.safeParse`; on failure redirect to `/dashboard/goal?error=<msg>`; on success `supabase.from("body_composition_goals").insert({ user_id: context.locals.user.id, goal_type: parsed.data.goal_type })`; redirect to `/dashboard/goal` on success, `/dashboard/goal?error=<msg>` on DB error).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Valid submission (`lose`/`gain`/`maintain`) creates a new row visible only to the submitting user
- [ ] An invalid value (e.g. `shrink`) is rejected with an error redirect, no row inserted
- [ ] Submitting the same `goal_type` twice in a row succeeds both times (no duplicate-prevention friction — matches the append-only design)
- [ ] An unauthenticated request redirects to `/auth/signin`

---

## Phase 3: UI — goal page and dashboard shell display

### Overview

A dedicated page for setting/viewing the goal, plus a small display on the dashboard shell.

### Changes Required:

#### 1. Goal page

**File**: `src/pages/dashboard/goal.astro`

**Intent**: Show the current goal (or an empty-state prompt) and let the user set or edit it via the same form, following the `?edit=` query-param toggle pattern already used for exercises.

**Contract**: Frontmatter queries `body_composition_goals` for the authenticated user's latest row (`.order("created_at", { ascending: false }).limit(1).maybeSingle()`). When no row exists, or `Astro.url.searchParams.get("edit")` is set, render the radio-button form (pre-selected to the current `goal_type` if one exists, unselected otherwise) posting to `/api/goal/create`; otherwise render a read-only "Current goal: …" view with an "Edit" link (`?edit=1`). Reads `?error=` via `ServerError` the same way `plans/[id].astro` does.

#### 2. Dashboard shell

**File**: `src/pages/dashboard.astro`

**Intent**: Surface the current goal (or a "not set" indicator) on the landing shell, with a link to `/dashboard/goal`.

**Contract**: Frontmatter adds the same "latest row" query as the goal page. Adds a line/card showing the current `goal_type` (or "No goal set yet") plus a link to `/dashboard/goal`, alongside the existing "Training plans" link.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] First visit with no goal set shows the empty-state form (nothing pre-selected) with a "No goal set yet" message
- [ ] Setting a goal for the first time immediately shows it as the current goal in the read-only view
- [ ] Clicking "Edit" reopens the form pre-selected to the current value
- [ ] Submitting a new value updates the displayed current goal
- [ ] `dashboard.astro` shows the current goal (or "not set") and links to `/dashboard/goal`
- [ ] A second user sees no goal data from the first user's account

---

## Testing Strategy

### Manual Testing Steps:

1. As a fresh user with no goal, visit `/dashboard/goal` — confirm empty-state form and message.
2. Set a goal, confirm it displays as current and appears on `dashboard.astro`.
3. Edit to a different value, confirm the display updates and the prior value is not shown as current.
4. Submit an invalid value directly against the API route (bypassing the UI) and confirm it's rejected.
5. Log in as a second user and confirm no goal data leaks across accounts.

## Migration Notes

Not applicable — new table, no existing data to migrate.

## References

- Prior implementation: `context/changes/log-workout-against-plan/plan.md` (closest analog: same three-layer pattern, ownership-hardened RLS from the start)
- `context/foundation/lessons.md` — "Pair RLS with explicit GRANTs"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation — `body_composition_goals` schema

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase — f1e8ce8
- [x] 1.2 Type checking passes — f1e8ce8
- [x] 1.3 Linting passes — f1e8ce8

#### Manual

- [x] 1.4 Cross-user select is blocked by RLS — f1e8ce8
- [x] 1.5 Insert with another user's user_id is rejected by the insert policy — f1e8ce8
- [x] 1.6 A user can insert multiple rows without a uniqueness conflict — f1e8ce8
- [x] 1.7 Update/delete against the table is denied (no policy exists) — f1e8ce8

### Phase 2: API route — create a goal entry

#### Automated

- [x] 2.1 Type checking passes
- [x] 2.2 Linting passes

#### Manual

- [ ] 2.3 Valid submission creates a new row visible only to the submitting user
- [ ] 2.4 Invalid value is rejected, no row inserted
- [ ] 2.5 Submitting the same goal_type twice succeeds both times
- [ ] 2.6 Unauthenticated request redirects to /auth/signin

### Phase 3: UI — goal page and dashboard shell display

#### Automated

- [ ] 3.1 Type checking passes
- [ ] 3.2 Linting passes

#### Manual

- [ ] 3.3 Empty state shows form with nothing pre-selected and "No goal set yet" message
- [ ] 3.4 Setting a goal for the first time shows it as current
- [ ] 3.5 Edit link reopens form pre-selected to current value
- [ ] 3.6 Submitting a new value updates the displayed current goal
- [ ] 3.7 dashboard.astro shows current goal (or "not set") and links to /dashboard/goal
- [ ] 3.8 A second user sees no goal data from the first user's account
