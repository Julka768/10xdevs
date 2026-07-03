# Log Workout Against Plan — Plan Brief

> Full plan: `context/changes/log-workout-against-plan/plan.md`

## What & Why

Let a logged-in user log a workout session (exercise, weight, reps) against their own training plan, visible only in their own log history. This is roadmap slice S-02, the **north star**: the smallest end-to-end flow proving that logging against *your own plan* — not a generic tracker — is what makes unified tracking valuable (US-01, FR-001, FR-005).

## Starting Point

`training_plans` and `exercises` exist with owner-only RLS (from S-01/F-01). `/dashboard/plans/[id].astro` already lists a plan's exercises with inline add/edit/delete via form-POST API routes. No workout-logging table, route, or UI exists yet.

## Desired End State

On `/dashboard/plans/[id]`, a user can click "Log" under any exercise to record a workout entry (weight, reps, sets completed, date), see all their entries for that plan grouped by date below the exercise list, and edit or delete any entry in place. Entries stay visible (with the exercise's name) even if that exercise is later deleted from the plan.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Log granularity | One row per exercise per session: weight + reps + sets_completed | Single fast form, but enough data (weight×reps×sets) for S-06's later volume calc | Plan |
| Session model | Flat log rows, no `workout_sessions` entity | Matches the established flat-table pattern (`training_plans`/`exercises`); no new entity/RLS surface | Plan |
| Date entry | User picks a date, defaults to today | Supports backfilling and feeds S-06's week-over-week comparison accurately | Plan |
| Edit/delete | Both, mirroring the exercises CRUD pattern | Consistent UX with the rest of the app | Plan |
| Deleted-exercise handling | Nullable `exercise_id` (`ON DELETE SET NULL`) + snapshotted `exercise_name` | Satisfies the PRD guardrail "logged data is never lost or corrupted" while keeping plan editing unrestricted | Plan |
| Logging UI location | Inline on the plan detail page, per exercise row | Reuses the already-shipped page; zero new routing | Plan |
| History view | Grouped by date, scoped to the plan being viewed | Reads like real workout sessions without a session entity | Plan |
| Repeat logs | Unrestricted — same exercise can be logged multiple times per day | Matches real gym behavior (warm-up + working sets); avoids update-vs-insert branching | Plan |

## Scope

**In scope:**
- `workout_logs` table + RLS (plan/exercise ownership checked on insert, matching the already-hardened `exercises` policies) + GRANTs
- Create/update/delete API routes for log entries
- Inline logging form and date-grouped history view on `/dashboard/plans/[id]`

**Out of scope:**
- A `workout_sessions` grouping entity or per-set logging
- A dedicated "Log Workout" page
- Cross-plan history view (all logs across all of a user's plans) — deferred to S-06
- Any change to `exercises` deletion behavior

## Architecture / Approach

Same three-layer pattern as S-01: Supabase migration (schema + RLS + GRANTs) → form-POST API routes with zod validation → Astro UI extending the existing plan detail page with the same inline query-param-driven form pattern already used for exercise editing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data foundation | `workout_logs` table, RLS (ownership-hardened from the start), GRANTs | Getting the insert policy's ownership check right the first time — S-01's `exercises` policy needed a follow-up hardening migration for exactly this |
| 2. API routes | Create/update/delete routes + zod validation (reject future dates) | Exercise name must be looked up server-side at log time, never trusted from client input |
| 3. UI | Inline log form + date-grouped, editable/deletable history | Plan detail page gets busier — acceptable per the "inline" decision, but worth watching if it grows further |

**Prerequisites:** S-01 (done) — `training_plans`/`exercises` schema and RLS pattern must exist.
**Estimated effort:** ~1 session across 3 phases, similar size to S-01.

## Open Risks & Assumptions

- Assumes the `numeric(6,2)` weight column is sufficient precision for all realistic plate-loading scenarios (kg or lb, fractional).
- History is scoped per-plan, not global — if a user has multiple plans, they see each plan's log separately. This matches "log against your own plan" but S-06 will need to aggregate across plans for the weekly report.

## Success Criteria (Summary)

- A user can log a workout entry against an exercise in their plan and see it appear immediately in that plan's grouped history.
- Log entries are never visible to another account (RLS-enforced).
- Deleting an exercise never destroys its logged history — the entry survives with a snapshotted exercise name.
