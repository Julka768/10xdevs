# Create, View, Edit, Delete Training Plan Exercises — Implementation Plan

## Overview

Build the first domain CRUD feature in the app: a user can create training plans, and within a plan, create/view/edit/delete exercises (name, target sets, target reps). This is roadmap slice S-01, built on the F-01 schema (`training_plans` + `exercises`, both RLS-scoped to `auth.uid() = user_id`), which already exists and needs no changes.

## Current State Analysis

- `supabase/migrations/20260703121505_create_training_plan_schema.sql` defines `training_plans` (`id`, `user_id`, `name`, `created_at`) and `exercises` (`id`, `plan_id`, `user_id`, `name`, `target_sets`, `target_reps`, `position`, `created_at`, unique `(plan_id, position)`), both with full per-user RLS and explicit `GRANT`s. No application code touches these tables yet.
- `/dashboard` (`src/pages/dashboard.astro`) is a bare shell — welcome message + sign-out form, no nav, no domain UI.
- The only existing API routes (`src/pages/api/auth/{signin,signup,signout}.ts`) share one shape: `POST`-only, read `FormData`, get a fresh untyped Supabase client via `createClient(context.request.headers, context.cookies)`, and respond exclusively via `context.redirect(...)` — success to a fixed path, failure to `<page>?error=<message>`. No route in the repo returns a JSON body or uses `GET`/`PATCH`/`DELETE` exports (native HTML forms can only submit `GET`/`POST` anyway, so this is also the ceiling of what a browser form can call directly).
- `src/middleware.ts` populates `context.locals.user` on **every** request (not just protected ones) and only *redirects* unauthenticated requests when the path starts with `/dashboard`. This means new API routes under `/api/plans/*` are not auto-protected by path — each one must check `context.locals.user` itself.
- No zod, no generated Supabase types, no `context.locals.supabase`. `src/components/ui/` has only `button.tsx` (shadcn) and an unrelated `LibBadge.astro`.
- `src/components/auth/*` establishes the one React-island precedent: Astro page passes a server-derived prop (e.g. `error` from `Astro.url.searchParams`) into a component mounted with `client:load`; the component does client-side pre-validation but the actual submission is an uncontrolled native form POST.

## Desired End State

A signed-in user can:
- Visit `/dashboard/plans`, see a list of their training plans (or an empty-state CTA if they have none), and create a new plan by name.
- Open a plan at `/dashboard/plans/[id]`, rename it, or delete it (with a confirmation dialog) — deleting returns them to the list.
- Within a plan, add an exercise (name, target sets, target reps) — it's appended to the end of the ordered list.
- Edit an exercise's name/sets/reps in place, or delete it (with a confirmation dialog).
- See an empty-state message + CTA when a plan has no exercises yet.

All of the above is verified to be strictly scoped to the signed-in user's own data (a second test account can never see, rename, or delete the first account's plans/exercises).

### Key Discoveries:

- `src/middleware.ts:18` uses `startsWith`, so `/dashboard/plans` and `/dashboard/plans/[id]` inherit the existing `/dashboard` auth redirect automatically — only the new `/api/plans/*` routes need their own auth check.
- Supabase `update()`/`delete()` against a row the caller's RLS policy excludes returns success with zero affected rows, not an error — this is the mechanism by which "not found" and "not owned" collapse into the same code path (see Critical Implementation Details).
- `supabase/config.toml:5` (`project_id = "10x-astro-starter"`) confirms a local Supabase project is already initialized, so `supabase gen types typescript --local` works without extra setup.
- No migration is needed anywhere in this plan — every field this feature reads or writes already exists in the F-01 schema.

## What We're NOT Doing

- Exercise reordering (drag-and-drop or move up/down) — exercises are auto-appended at `position = count + 1`; fixing order requires delete-and-recreate for v1.
- Toast/flash notification system — errors and success surface via the existing `?error=` query-param + redirect pattern, matching auth routes.
- A shared exercise library, autocomplete, or duplicate-name detection — free-text entry is the PRD's explicitly accepted risk for v1.
- Logging actual workout sessions (sets/reps/weight performed) — that's S-02 (`log-workout-against-plan`), out of scope here.
- Any client-side JSON `fetch` API — all mutations are native `<form method="POST">` submissions, matching the codebase's only precedent.
- New database migrations — the F-01 schema is sufficient as-is; this plan is purely an application layer on top of it.
- A DB-level guard ensuring an exercise's `plan_id` belongs to its own `user_id` — already an accepted risk from F-01 (RLS still prevents cross-user visibility).

## Implementation Approach

Three phases, each independently shippable:

1. **Foundation** — generate typed Supabase types, thread them into `createClient`, add zod, install the shadcn primitives this feature needs. No user-visible change.
2. **Plans** — API routes + list page + detail-page shell for the plan entity: create, rename, delete.
3. **Exercises** — API routes + detail-page body for the exercise entity: create, view, edit, delete, nested inside a plan.

Every mutation follows the same shape as the existing auth routes: `POST` route reads `FormData`, validates with zod, gets a user-scoped Supabase client, performs the operation, and redirects — success to the relevant page, failure back to the originating page with `?error=`.

## Critical Implementation Details

- **RLS makes "not found" and "not owned" indistinguishable, and silent.** A `.update()` or `.delete()` call scoped by RLS to rows the caller doesn't own returns `{ data: [], error: null }` — no thrown error. Every update/delete route in Phases 2 and 3 must call `.select()` after the mutation and check `data.length === 0` to detect this case and redirect with an error; otherwise a stale or malicious request silently no-ops while the route still redirects as if it succeeded.

  ```ts
  const { data, error } = await supabase.from("training_plans").delete().eq("id", id).select();
  if (error || !data || data.length === 0) {
    return context.redirect(`/dashboard/plans?error=${encodeURIComponent("Plan not found")}`);
  }
  ```

- **Exercise auto-append position has no locking.** Computing `position = count + 1` requires a `SELECT count(*)` before the `INSERT`, with no transaction wrapping the two. Given single-user-per-session usage, a lost-update race is an accepted risk, not something to add DB-level locking for in this slice.

- **Every one of the 6 mutation routes must check `context.locals.user` itself**, not just the create-plan route. `/api/plans/*` is not covered by `PROTECTED_ROUTES` in `src/middleware.ts` (it only guards `/dashboard`), so each route redirects to `/auth/signin` if `context.locals.user` is absent, same as Phase 2 item 1's create-plan route. RLS backstops actual data safety either way (an unauthenticated request's Supabase client has no `auth.uid()`, so mutations just no-op per the point above) — but skipping this check means an unauthenticated POST gets a confusing generic "not found" redirect instead of a clear sign-in prompt.

## Phase 1: Foundation — typed client, zod, shadcn primitives

### Overview

Set up the shared infrastructure Phases 2 and 3 build on: generated Supabase types threaded through the client, zod validation schemas, and the shadcn components (`input`, `label`, `alert-dialog`, `card`) needed for plan/exercise forms and delete confirmation. No user-facing behavior changes in this phase.

### Changes Required:

#### 1. Generated Supabase types

**File**: `src/lib/database.types.ts` (new, generated)

**Intent**: Give every later query against `training_plans`/`exercises` compile-time type safety instead of `any`.

**Contract**: Generate via `npx supabase gen types typescript --local > src/lib/database.types.ts`. Exports a `Database` type matching the F-01 schema. Requires the local Supabase stack running (`supabase start`) first — `--local` introspects the running local Postgres instance, not the migration files on disk.

#### 2. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Thread the generated `Database` type into the existing `createClient` helper so every call site gets typed query results, without changing its signature or call sites.

**Contract**: `createServerClient<Database>(...)` — import `Database` from `./database.types`; the function's exported signature (`createClient(requestHeaders, cookies)`) is unchanged, so `src/middleware.ts` and all API routes need no edits for this alone.

#### 3. Validation schemas

**File**: `src/lib/validation/training-plan.ts` (new)

**Intent**: Centralize the zod schemas for plan and exercise input, mirroring the DB constraints from the F-01 migration (non-empty name, positive integer sets/reps) so invalid input is rejected before it reaches Postgres.

**Contract**:

```ts
export const planNameSchema = z.string().trim().min(1).max(120);
export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  target_sets: z.coerce.number().int().positive(),
  target_reps: z.coerce.number().int().positive(),
});
```

`z.coerce.number()` is required because `FormData` values are always strings.

#### 4. shadcn primitives

**Files**: `src/components/ui/{input,label,alert-dialog,card}.tsx` (new, generated)

**Intent**: Install the shadcn primitives Phases 2–3 need for form fields, plan cards, and delete confirmation dialogs.

**Contract**: `npx shadcn@latest add input label alert-dialog card` — lands under `src/components/ui/` per `components.json`'s existing aliases, same as `button.tsx`.

#### 5. Shared delete-confirm component

**File**: `src/components/plans/DeleteConfirmButton.tsx` (new)

**Intent**: One reusable client island wrapping shadcn `AlertDialog` around a delete `<form>`, parameterized by form `action` and confirmation copy, so Phases 2 and 3 don't each hand-roll a dialog.

**Contract**: Props: `{ action: string; itemLabel: string }`. Renders a trigger button that opens an `AlertDialog`; on confirm, submits a `<form method="POST" action={action}>` with no body fields (the target id is already in the action URL). Mounted with `client:load` from `.astro` pages.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `src/lib/database.types.ts` exists and exports a `Database` type with `public.Tables.training_plans` and `public.Tables.exercises`

#### Manual Verification:

- Existing sign-in/sign-up/sign-out flows and the `/dashboard` shell still work unchanged (regression check — this phase touches shared infrastructure but no user-facing routes)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Training plans — create, list, rename, delete

### Overview

Deliver the plan entity's full lifecycle: a list page with create-plan form and empty state, and a detail-page shell (header with rename form + delete button) that Phase 3 will extend with exercises.

### Changes Required:

#### 1. Create-plan route

**File**: `src/pages/api/plans/index.ts` (new)

**Intent**: Insert a new `training_plans` row owned by the current user, then redirect to its detail page.

**Contract**: `POST` only. Reads `name` from `FormData`, validates with `planNameSchema`. Requires `context.locals.user`; redirects to `/auth/signin` if absent. On success, `context.redirect(\`/dashboard/plans/${data.id}\`)`. On validation or Supabase error, `context.redirect(\`/dashboard/plans?error=...\`)`.

#### 2. Rename-plan route

**File**: `src/pages/api/plans/[id]/rename.ts` (new)

**Intent**: Update a plan's `name`, scoped to the owner via RLS.

**Contract**: `POST` only. Reads `name`, validates, updates `training_plans` where `id = params.id`, applies the `.select()` + zero-rows check from Critical Implementation Details. Redirects back to `/dashboard/plans/[id]` on success or with `?error=` on failure.

#### 3. Delete-plan route

**File**: `src/pages/api/plans/[id]/delete.ts` (new)

**Intent**: Delete a plan (and, via `ON DELETE CASCADE` on `exercises.plan_id`, its exercises) scoped to the owner.

**Contract**: `POST` only. Deletes `training_plans` where `id = params.id`, same `.select()` + zero-rows check. Redirects to `/dashboard/plans` on success, or back to the detail page with `?error=` on failure.

#### 4. Plans list page

**File**: `src/pages/dashboard/plans/index.astro` (new)

**Intent**: Show the signed-in user's plans as cards (name + link into detail page + `DeleteConfirmButton`), a create-plan form, and an empty-state message + CTA when there are none.

**Contract**: Server-side queries `training_plans` via the typed client scoped to `Astro.locals.user` (RLS handles the actual filtering). Uses shadcn `card`, `input`, `label`, `button`. Reads `Astro.url.searchParams.get("error")` and renders it inline (mirroring `ServerError.tsx`'s role, reused or adapted).

#### 5. Plan detail page shell

**File**: `src/pages/dashboard/plans/[id].astro` (new)

**Intent**: Show one plan's name (with an always-visible inline rename form) and a delete button; reserves a body section for Phase 3's exercise list. If the plan doesn't exist or isn't owned by the current user (query returns no row — RLS-filtered), redirect to `/dashboard/plans`.

**Contract**: Server-side single-row query by `params.id`; `null` result → `Astro.redirect("/dashboard/plans")`. Rename form posts to `/api/plans/[id]/rename`; delete uses `DeleteConfirmButton` posting to `/api/plans/[id]/delete`.

#### 6. Dashboard nav link

**File**: `src/pages/dashboard.astro`

**Intent**: Give users a way to reach the new plans UI — currently nothing on `/dashboard` links anywhere.

**Contract**: Add one link/button to `/dashboard/plans` near the existing welcome content.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Creating a plan via the form redirects to its detail page and the plan is visible there
- The new plan appears in the `/dashboard/plans` list
- Renaming a plan persists after a page reload
- Deleting a plan (via the confirm dialog) redirects to the list and the plan no longer appears
- A second test account cannot see the first account's plans in its list, and navigating directly to the first account's plan-detail URL redirects to `/dashboard/plans` (not found, not an error leak)
- With zero plans, the list page shows an empty-state message and a create CTA instead of an empty list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Exercises — create, view, edit, delete within a plan

### Overview

Extend the plan detail page with the exercise list: add exercises, edit one in place, delete one, and show an empty state when a plan has no exercises yet.

### Changes Required:

#### 1. Create-exercise route

**File**: `src/pages/api/plans/[id]/exercises/index.ts` (new)

**Intent**: Insert a new exercise into the given plan, auto-appended at the end.

**Contract**: `POST` only. Reads `name`, `target_sets`, `target_reps`, validates with `exerciseInputSchema`. Computes `position` as `(SELECT count(*) FROM exercises WHERE plan_id = params.id) + 1`, sets `user_id = context.locals.user.id`, `plan_id = params.id`. Redirects to `/dashboard/plans/[id]` on success or `?error=` on failure.

#### 2. Update-exercise route

**File**: `src/pages/api/plans/[id]/exercises/[exerciseId]/update.ts` (new)

**Intent**: Replace an exercise's `name`/`target_sets`/`target_reps`; `position` is untouched (no reordering in this slice).

**Contract**: `POST` only. Same validation as create, updates by `params.exerciseId`, `.select()` + zero-rows check. Redirects to `/dashboard/plans/[id]`.

#### 3. Delete-exercise route

**File**: `src/pages/api/plans/[id]/exercises/[exerciseId]/delete.ts` (new)

**Intent**: Remove one exercise from a plan.

**Contract**: `POST` only. Deletes by `params.exerciseId`, `.select()` + zero-rows check. Redirects to `/dashboard/plans/[id]`.

#### 4. Exercise list + edit-in-place UI

**File**: `src/pages/dashboard/plans/[id].astro`

**Intent**: Render the plan's exercises ordered by `position`; each row is read-only (name, sets, reps, an "Edit" link, and `DeleteConfirmButton`) unless its id matches `?edit=<exerciseId>` in the URL, in which case that row renders an editable form instead. Below the list, an add-exercise form; if the list is empty, an empty-state message + CTA in its place.

**Contract**: Toggle state lives entirely in the URL query string (`Astro.url.searchParams.get("edit")`), consistent with how `error` is already threaded through auth pages — no client-side state needed. "Edit" is a plain link to `?edit=<id>`; the edit form's cancel action links back to the bare `[id]` URL.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Adding an exercise appends it to the end of the list with the correct next `position`
- Clicking "Edit" on an exercise reveals an editable row; saving updates name/sets/reps and returns to the read-only view with new values
- Deleting an exercise (via confirm dialog) removes it from the list
- With zero exercises, the plan detail page shows an empty-state message and an add-exercise CTA
- A second test account cannot view, edit, or delete the first account's exercises (direct POST to another user's exercise update/delete route redirects with an error, no data changes)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

No automated test suite exists in this repo yet (per `CLAUDE.md`), and introducing one is out of scope for this slice. Verification is: `npm run lint` + `npm run build` (automated) plus the manual steps listed per phase, most importantly the cross-user RLS checks (repeated at both the plan and exercise level, matching how F-01 verified RLS with two simulated users).

### Manual Testing Steps:

1. Sign in as User A, create a plan, add 2–3 exercises, edit one, delete one — confirm state after each step.
2. Sign in as User B (second test account) and confirm User A's plan is invisible in the list and its detail URL redirects.
3. As User B, attempt a direct `POST` to one of User A's plan/exercise mutation routes (e.g. via browser devtools or curl with User B's session cookie) and confirm it redirects with an error and changes nothing.
4. Delete a plan with exercises in it and confirm the exercises are gone too (cascade).

## Performance Considerations

None beyond the NFR baseline (sub-1s response) — all queries are simple, indexed lookups (`training_plans_user_id_idx`, `exercises_plan_id_idx`, `exercises_user_id_idx` already exist from F-01) against a small per-user dataset.

## Migration Notes

None — no schema changes in this plan.

## References

- F-01 schema: `supabase/migrations/20260703121505_create_training_plan_schema.sql`
- F-01 plan brief: `context/changes/training-plan-data-foundation/plan-brief.md`
- Auth route precedent: `src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`
- Supabase client helper: `src/lib/supabase.ts`
- Auth middleware: `src/middleware.ts`
- React island precedent: `src/components/auth/SignInForm.tsx`
- Lesson (RLS + GRANT): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — typed client, zod, shadcn primitives

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` passes
- [x] 1.3 `src/lib/database.types.ts` exists and exports a `Database` type with `public.Tables.training_plans` and `public.Tables.exercises`

#### Manual

- [x] 1.4 Existing sign-in/sign-up/sign-out flows and the `/dashboard` shell still work unchanged

### Phase 2: Training plans — create, list, rename, delete

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 Creating a plan via the form redirects to its detail page and the plan is visible there
- [ ] 2.4 The new plan appears in the `/dashboard/plans` list
- [ ] 2.5 Renaming a plan persists after a page reload
- [ ] 2.6 Deleting a plan (via the confirm dialog) redirects to the list and the plan no longer appears
- [ ] 2.7 A second test account cannot see the first account's plans in its list, and navigating directly to the first account's plan-detail URL redirects to `/dashboard/plans`
- [ ] 2.8 With zero plans, the list page shows an empty-state message and a create CTA

### Phase 3: Exercises — create, view, edit, delete within a plan

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Adding an exercise appends it to the end of the list with the correct next `position`
- [ ] 3.4 Clicking "Edit" reveals an editable row; saving updates values and returns to read-only view
- [ ] 3.5 Deleting an exercise (via confirm dialog) removes it from the list
- [ ] 3.6 With zero exercises, the plan detail page shows an empty-state message and an add-exercise CTA
- [ ] 3.7 A second test account cannot view, edit, or delete the first account's exercises
