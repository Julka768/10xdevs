# Training-Plan Data Foundation — Plan Brief

> Full plan: `context/changes/training-plan-data-foundation/plan.md`

## What & Why

Create the Supabase schema and RLS policy pattern for training plans and exercises. This is F-01 on the roadmap — a pure data-layer foundation, no UI or API. It exists so S-01 (create/view/edit/delete exercises in a plan) has something to build on, and so the RLS shape used here can be copy-pasted for five later domain tables (workout logs, goals, calories, measurements).

## Starting Point

`supabase/` has only `config.toml` — zero migrations, zero tables. Auth is fully working (`auth.users`, `auth.uid()` available), but no domain data exists anywhere in the app yet.

## Desired End State

A single migration creates `training_plans` and `exercises` with RLS enabled, such that any authenticated user can only ever see/edit/delete their own rows — verified locally with two simulated users before this is considered done.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Plans per user | Multiple plans allowed, no uniqueness constraint | User explicitly chose flexibility over the PRD's singular phrasing | Plan (user override) |
| Sets/reps format | Plain integers | Matches FR-002's literal wording; simplest type for S-02 to log against later | Plan |
| RLS shape | Denormalized `user_id` on `exercises` | Every future child table can copy this exact one-line policy, matching the roadmap's "template" goal | Plan |
| Exercise ordering | `position` column, no auto-trigger | Plans are inherently ordered; S-01 computes position at insert time | Plan |
| DB constraints | `NOT NULL` + positive-number/non-empty `CHECK`s | Catches broken data at the DB layer regardless of future UI bugs | Plan |
| Timestamps | `created_at` only, no `updated_at`/trigger | Nothing in current FRs needs an edit timestamp; matches `speed` goal | Plan |
| Verification | Local Docker stack + two-user RLS isolation test | Only way to catch a real RLS bug, which is exactly the risk the roadmap flags | Plan |
| Migration scope | One file for both tables | They're one atomic feature; `exercises` has no independent use without `training_plans` | Plan |

## Scope

**In scope:** `training_plans` + `exercises` tables, constraints, indexes, RLS policies, local verification.

**Out of scope:** Any UI, any API route, `updated_at` tracking, cross-table trigger enforcing plan/exercise ownership consistency, seed data.

## Architecture / Approach

One migration file, two tables, identical RLS policy shape on both (`auth.uid() = user_id`, four per-operation policies `TO authenticated`). `exercises.user_id` is denormalized from its parent `training_plans.user_id` so the policy never needs a join.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Training-plan schema + RLS foundation | Both tables, constraints, indexes, RLS policies, verified locally | An RLS policy bug could leak or block data across users — this is exactly what the manual two-user verification step exists to catch |

**Prerequisites:** Docker running locally (for `supabase start`); Supabase CLI already in `devDependencies`.
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- Assumes local Docker is available to run `supabase start`/`db reset` — no other way to verify RLS before this lands.
- Accepted: no DB-level guard against an exercise's `plan_id` pointing at a plan not owned by its own `user_id` — RLS still prevents any cross-user visibility, so this can't leak data, only create an orphaned row from a malformed insert.

## Success Criteria (Summary)

- Migration applies cleanly to a fresh local Postgres via `supabase db reset`.
- Two simulated users can never see, edit, or delete each other's plans/exercises.
- Invalid rows (zero/negative sets-reps, empty names, duplicate position within a plan) are rejected at the DB layer.
