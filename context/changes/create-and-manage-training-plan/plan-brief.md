# Create, View, Edit, Delete Training Plan Exercises — Plan Brief

> Full plan: `context/changes/create-and-manage-training-plan/plan.md`

## What & Why

Build the first domain CRUD feature in the app: create training plans, and within a plan, create/view/edit/delete exercises (name, target sets, target reps). This is roadmap slice S-01 (FR-002, FR-003) — the prerequisite for S-02, the product's north star (logging a workout against your own plan).

## Starting Point

F-01 already shipped the schema: `training_plans` + `exercises` tables with per-user RLS, indexes, and constraints — no migration work needed here. Nothing in the application layer touches these tables yet; `/dashboard` is a bare shell with no nav, no domain UI. The only existing API/UI precedent is the auth flow: native form POST, redirect-based success/error, no JSON APIs, no zod, no typed Supabase client.

## Desired End State

A signed-in user manages their training plans at `/dashboard/plans`: list plans, create one, open it to rename/delete it or manage its exercises (add, edit in place, delete). Empty states guide a first-time user. All of it is strictly scoped to the signed-in user, verified with a second test account.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| API/form pattern | Native form POST + redirect | Matches the only existing precedent (auth routes); zero new plumbing | Plan (user-confirmed) |
| Input validation | zod schemas | Matches CLAUDE.md's stated direction; handles FormData→number coercion cleanly | Plan (user-confirmed) |
| Supabase client | Generate types now (`supabase gen types typescript`) | First feature with real query variety — type safety pays off immediately | Plan (user-confirmed) |
| Exercise ordering | Auto-append, no reorder UI | Simplest v1; `position` column already supports future reordering | Plan (user-confirmed) |
| Delete confirmation | shadcn `AlertDialog` | Consistent with the app's already-configured shadcn/ui system | Plan (user-confirmed) |
| Plan scope | Multi-plan list + detail view | Matches F-01's schema decision (multiple plans allowed, no unique constraint) | Plan (user-confirmed) |
| Empty states | Message + CTA, no auto-redirect | Standard, predictable UX; user stays in control | Plan (user-confirmed) |
| Error surfacing | `?error=` query param + redirect | Reuses the chosen form-POST pattern and existing error-rendering precedent | Plan (user-confirmed) |
| Plan-level CRUD | Create, rename, and delete plan | Rename avoids a delete-and-recreate workaround for typos | Plan (user-confirmed) |

## Scope

**In scope:** Plan CRUD (create/rename/delete), exercise CRUD (create/view/edit/delete) nested in a plan, empty states, cross-user RLS verification, generated Supabase types, zod validation.

**Out of scope:** Exercise reordering UI, toast notifications, shared exercise library/autocomplete, workout-session logging (S-02), any client-side JSON fetch API, new DB migrations.

## Architecture / Approach

Three phases: (1) foundation — typed client, zod, shadcn primitives, shared delete-confirm component; (2) plan entity — list page, detail-page shell, create/rename/delete routes; (3) exercise entity — detail-page body, create/update/delete routes, edit-in-place via a `?edit=<id>` URL toggle. Every mutation is a `POST`-only API route under `/api/plans/...` that validates with zod, applies the operation via a user-scoped Supabase client, and redirects.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation | Typed Supabase client, zod schemas, shadcn primitives, shared delete-confirm component | None user-facing; regression risk to existing auth flows is the only thing to check |
| 2. Training plans | List, create, rename, delete a plan | RLS "not found vs. not owned" silently no-ops instead of erroring — routes must explicitly check affected-row count |
| 3. Exercises | Create, view, edit, delete exercises within a plan | Same silent-no-op risk, plus position auto-append has no locking (accepted risk for v1 scale) |

**Prerequisites:** F-01 (done) — schema + RLS already in place. Local Supabase CLI available for type generation.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- RLS `update`/`delete` no-ops silently on unauthorized rows — every mutation route must check `.select()` result length, not just `error`, or a failed operation will look like a success.
- No locking around exercise position auto-append — accepted as low risk given single-user-per-session usage at MVP scale.
- No DB-level guard that an exercise's `plan_id` belongs to its own `user_id` — pre-accepted risk from F-01; RLS still prevents cross-user data leakage.

## Success Criteria (Summary)

- A user can create a plan, add/edit/delete exercises in it, rename/delete the plan itself, and see clear empty states throughout.
- A second account can never see, read, modify, or delete another account's plans or exercises — verified manually with two test accounts.
- `npm run lint` and `npm run build` pass after every phase.
