# Log Daily Calories — Plan Brief

> Full plan: `context/changes/log-daily-calories/plan.md`

## What & Why

Let a logged-in user log calories consumed on a given day and see their own history, so FR-006 is satisfied and S-06 (weekly report) has a real calorie data source to compare against a goal. Roadmap slice S-04 — independent, no prerequisites, the roadmap's own risk note calls it "the smallest, most self-contained slice."

## Starting Point

No calorie-related table, route, or UI exists yet. Two prior slices (`training-plan-data-foundation`, `create-and-manage-training-plan`, `log-workout-against-plan`) already established the exact per-user-owned-table pattern (RLS + GRANTs + indexes), the form-POST/zod/redirect route pattern, and the query-param-driven inline-edit UI pattern this plan reuses directly.

## Desired End State

A user visiting `/dashboard/calories` can log one or more calorie entries for today (or edit the date), see all their entries grouped by date with each date's total, and edit or delete any entry in place — scoped entirely to their own account.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Daily model | Multiple entries per day, summed for display | Matches the only existing date-scoped table (`workout_logs`), which allows multiple same-date rows with no uniqueness constraint — no new pattern to invent |
| Page structure | Dedicated `/dashboard/calories` page | Consistent with the one-page-per-domain convention; calories has no natural parent page to nest under |
| Validation bounds | Positive integer, no upper cap | Matches every other numeric field in the codebase (e.g. workout weight also has no cap) |
| Default view | Today's form + full history below | Reuses the plan-detail page's log-plus-history shape a third time |

## Scope

**In scope:** `calorie_logs` migration (RLS/GRANT + not-future CHECK from the start), 3 API routes (create/update/delete), `/dashboard/calories` page with date-grouped history + daily totals, one dashboard nav link.

**Out of scope:** Single-total-per-day model, meal/food-name itemization, calorie-vs-goal comparison (S-06's job), any upper-bound sanity check, date-picker/filter UI.

## Architecture / Approach

Three phases mirroring `log-workout-against-plan` exactly: migration → API routes → UI. `calorie_logs` is simpler than `workout_logs` in one respect — it has no FK to another owned table, so its RLS policies need only `auth.uid() = user_id`, no parent-ownership subquery, and no column needs GRANT-level immutability.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data foundation | `calorie_logs` schema, RLS, GRANTs, not-future CHECK | Low — direct copy of an established pattern |
| 2. API routes | Create/update/delete routes | Low — direct copy of the `workout_logs` routes' shape |
| 3. UI | Calories page, nav link, grouped history + totals | Low — direct copy of the plan-detail page's shape, plus a new summed-total calculation |

**Prerequisites:** None — independent slice, no dependency on other in-progress work.
**Estimated effort:** ~1 session across 3 phases, similar scope to `log-workout-against-plan`.

## Open Risks & Assumptions

- Assumes the future-date CHECK constraint added directly in Phase 1 (rather than as a follow-up migration, unlike `workout_logs`' history) doesn't need its own separate migration — low risk, it's the exact same constraint shape already proven to work.
- If the test-plan rollout's Phase 1 (`testing-critical-path-integrity`) lands before this slice is implemented, its RLS/GRANT integration-test pattern should be extended to `calorie_logs` — not written here since that harness didn't exist at plan time.

## Success Criteria (Summary)

- A user can log, edit, and delete calorie entries for any day, with entries private to their own account.
- Multiple same-day entries display grouped under one date heading with a correct summed total.
- Future-dated entries are rejected both by the app and at the DB layer.
