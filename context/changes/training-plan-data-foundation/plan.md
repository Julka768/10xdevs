# Training-Plan Data Foundation Implementation Plan

## Overview

Establish the Supabase schema and Row-Level Security (RLS) policy pattern for training plans and exercises. This is a pure data-layer change — no UI, no API routes. It unlocks S-01 (`create-and-manage-training-plan`) and, per the roadmap, sets the RLS/schema template every later domain table (workout logs, goals, calories, measurements) will replicate.

## Current State Analysis

- `supabase/` contains only `config.toml` + `.gitignore` — zero migrations exist, no table has been created yet.
- Auth is fully wired (`src/lib/supabase.ts`, `@supabase/ssr`, `astro:env/server`) and already provides `auth.users` plus `auth.uid()` for RLS policies to key off.
- CI (`.github/workflows/ci.yml`) never applies migrations — it only lints and builds. Verification of this migration must happen locally.
- No `docs/reference/contract-surfaces.md` or `context/foundation/lessons.md` exist yet in this repo, so there is no prior table/RLS convention to follow — this migration establishes the first one.

## Desired End State

A single migration file exists under `supabase/migrations/` that, when applied to a fresh local Supabase Postgres instance (`supabase db reset`), creates `training_plans` and `exercises` with RLS enabled and per-operation policies, such that:
- An authenticated user can only `SELECT`/`INSERT`/`UPDATE`/`DELETE` rows they own (verified with two distinct simulated users, per the PRD's "never visible to another user" guardrail).
- Both tables reject obviously-invalid rows at the DB layer (empty names, non-positive set/rep counts).

### Key Discoveries:

- PRD FR-002/FR-003 accept free-text exercise entry with no shared library — no additional validation beyond non-empty/positive checks is warranted.
- The roadmap's own risk note for F-01 explicitly calls this migration "the template" for five more tables — the RLS policy shape chosen here is deliberately kept copy-paste-simple for that reason.

## What We're NOT Doing

- No UI or API routes (`src/pages/api/**`) — that's S-01's job.
- No `updated_at` column or update-timestamp trigger — nothing in the current FRs needs an edit timestamp; add later if a slice needs it.
- No trigger enforcing that `exercises.plan_id` belongs to a plan owned by `exercises.user_id`. Accepted risk: RLS still guarantees no row is ever visible to a user other than the one named in its own `user_id` column, so this cannot cause a cross-user data leak — at worst a malformed insert (bypassing the app layer entirely) could create an orphaned exercise row unreachable through normal own-plan queries. Denormalizing `user_id` keeps the policy pattern simple, per the roadmap's stated template goal.
- No "active plan" concept — multiple training plans per user are allowed with no distinction between them beyond `name`.
- No seed data — this is schema only.

## Implementation Approach

One migration file creates both tables together, since `exercises` cannot exist independently of `training_plans` (FK dependency, same feature). Both tables use the identical RLS policy shape — `auth.uid() = user_id`, four separate per-operation policies scoped `TO authenticated` — with `exercises.user_id` denormalized from its parent plan specifically so this shape is copy-pasteable for future child tables (workout logs, etc.).

## Critical Implementation Details

### State sequencing

`exercises.position` has no default and no trigger to auto-assign it — it's a plain `NOT NULL integer` with a `UNIQUE (plan_id, position)` constraint. The future implementer (S-01, not this plan) must compute the next position at insert time, e.g. `SELECT COALESCE(MAX(position), 0) + 1 FROM exercises WHERE plan_id = $1`, and should be prepared to retry once on a `unique_violation` under concurrent inserts to the same plan.

## Phase 1: Training-plan schema + RLS foundation

### Overview

Create `training_plans` and `exercises` with constraints, indexes, and per-operation RLS policies in one migration; verify locally that RLS actually isolates rows between two users.

### Changes Required:

#### 1. Migration: training plan schema

**File**: `supabase/migrations/20260703121505_create_training_plan_schema.sql`

**Intent**: Create the two foundation tables plus their RLS policies in one atomic migration, establishing the reusable per-operation RLS pattern for all future domain tables.

**Contract**: Two tables (`public.training_plans`, `public.exercises`), each with RLS enabled and four `TO authenticated` policies (`SELECT`/`INSERT`/`UPDATE`/`DELETE`, all keyed on `auth.uid() = user_id`). `exercises.user_id` is denormalized from the parent plan. Indexes on both FK columns. This is the non-obvious, load-bearing part other tables will copy, so the exact SQL:

```sql
-- training_plans
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create index training_plans_user_id_idx on public.training_plans(user_id);

alter table public.training_plans enable row level security;

create policy "training_plans_select_own" on public.training_plans
  for select to authenticated
  using (auth.uid() = user_id);

create policy "training_plans_insert_own" on public.training_plans
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "training_plans_update_own" on public.training_plans
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "training_plans_delete_own" on public.training_plans
  for delete to authenticated
  using (auth.uid() = user_id);

-- exercises
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_sets integer not null check (target_sets > 0),
  target_reps integer not null check (target_reps > 0),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (plan_id, position)
);

create index exercises_plan_id_idx on public.exercises(plan_id);
create index exercises_user_id_idx on public.exercises(user_id);

alter table public.exercises enable row level security;

create policy "exercises_select_own" on public.exercises
  for select to authenticated
  using (auth.uid() = user_id);

create policy "exercises_insert_own" on public.exercises
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "exercises_update_own" on public.exercises
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "exercises_delete_own" on public.exercises
  for delete to authenticated
  using (auth.uid() = user_id);
```

### Success Criteria:

#### Automated Verification:

- Local Supabase stack starts: `supabase start`
- Migration applies cleanly to a fresh DB: `supabase db reset`
- Migration list shows the new migration as applied: `supabase migration list`

#### Manual Verification:

- Using Supabase Studio (or `psql` against the local DB), create two test users in `auth.users`, insert a `training_plans` row and an `exercises` row as each user, and confirm: each user's `SELECT` only returns their own rows, and an `UPDATE`/`DELETE` attempt against the other user's row affects zero rows.
- Confirm a `CHECK` constraint violation is rejected: inserting an exercise with `target_sets = 0`, `position = 0`, or an empty `name` fails.
- Confirm inserting a second exercise with a duplicate `(plan_id, position)` fails with a `unique_violation`.
- Link the local project to the target remote Supabase project and push the migration (`supabase link --project-ref <ref>` then `supabase db push`, or apply via the Dashboard SQL editor). Local `supabase db reset` only affects the local Docker Postgres — S-01 cannot function until `training_plans`/`exercises` exist in the environment the deployed app actually connects to (`SUPABASE_URL`/`SUPABASE_KEY`, the same secrets `.github/workflows/ci.yml`'s `deploy` job uses).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing (RLS isolation + constraint checks) was successful before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- None — no application code in this change.

### Integration Tests:

- None automated (no CI migration step exists yet). RLS correctness is verified manually per Phase 1's Manual Verification.

### Manual Testing Steps:

1. `supabase start`, `supabase db reset`.
2. Create two users via `supabase.auth.admin.createUser` (Studio → Authentication, or SQL) to get two distinct `auth.users` rows.
3. As each user (via `SET request.jwt.claims` or the Supabase JS client with that user's session), insert a plan + exercise, then attempt to read/update/delete the other user's rows and confirm zero rows affected.
4. Attempt an invalid insert (`target_sets = 0`, empty `name`, duplicate `position`) and confirm each is rejected.

## Performance Considerations

Indexes on `training_plans.user_id`, `exercises.plan_id`, and `exercises.user_id` cover the query patterns S-01 will need (list plans for a user, list exercises for a plan). Data volume is small per the PRD's `target_scale`, so no further tuning is warranted.

## Migration Notes

No existing data to migrate — these are brand-new tables.

This migration must also be pushed to the remote Supabase project(s) referenced by `SUPABASE_URL`/`SUPABASE_KEY` (the CI/deploy secrets) before S-01 begins — `supabase db reset` only verifies against the local Docker Postgres and has no effect on any remote environment.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-002, FR-003)
- Change identity: `context/changes/training-plan-data-foundation/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Training-plan schema + RLS foundation

#### Automated

- [x] 1.1 Local Supabase stack starts: `supabase start` — bc697f3
- [x] 1.2 Migration applies cleanly: `supabase db reset` — bc697f3
- [x] 1.3 Migration list shows new migration applied: `supabase migration list` — bc697f3

#### Manual

- [x] 1.4 RLS isolation verified with two test users (SELECT/UPDATE/DELETE scoped correctly) — bc697f3
- [x] 1.5 CHECK constraint rejection verified (zero/negative sets-reps, empty name) — bc697f3
- [x] 1.6 UNIQUE (plan_id, position) rejection verified — bc697f3
- [x] 1.7 Migration pushed to remote Supabase project (`supabase db push` or Dashboard SQL editor) — tables confirmed to exist in the environment the deployed app connects to
