<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Date/Timezone Boundary Hardening Implementation Plan

- **Plan**: context/changes/testing-date-timezone-boundary-hardening/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-08-30
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — DB `CHECK` constraints not widened to match the new app-layer grace window

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260703170111_add_workout_logs_logged_at_not_future_check.sql:5`, `supabase/migrations/20260821094132_create_calorie_logs_schema.sql:5`, `supabase/migrations/20260821140000_create_body_measurements_schema.sql:10`

**Detail**: All three tables (`workout_logs`, `calorie_logs`, `body_measurements`) have a Postgres `CHECK (logged_at <= current_date)` constraint with no grace window. `isNotFutureDate` (src/lib/date-utils.ts:49-53) now accepts `logged_at` up to one UTC day ahead of "now" — but the DB constraint still enforces the old, un-widened boundary. Confirmed directly against the local Supabase instance: session `TimeZone` is `UTC`, so `current_date` matches the app's UTC "today" exactly, meaning tomorrow's UTC date (the app's new grace-window value) will pass Zod/`isNotFutureDate` and then fail the DB `CHECK` constraint on `INSERT`/`UPDATE`.

Concretely: a user in UTC+9..+14 submits their local "today" (= UTC tomorrow). Old behavior: rejected at the Zod layer with the accurate message "Date cannot be in the future" — the exact bug this phase exists to fix. New behavior: Zod now accepts it, but the database then rejects it, surfaced as a generic error:
- `src/pages/api/calories/index.ts:30-31` → "Could not log calories"
- `src/pages/api/measurements/index.ts:36-37` → "Could not log measurement"
- `src/pages/api/plans/[id]/exercises/[exerciseId]/logs.ts:50-51` → "Could not log workout"
- On the three `update.ts` routes (`plans/[id]/logs/[logId]/update.ts:31-33`, `measurements/[id]/update.ts:37-38`, `calories/[id]/update.ts:31-32`) the DB error is folded into the same branch as "row not found" — verified directly (`update.ts:31-33`: `if (error || data.length === 0)`), so editing an existing log to a grace-window date produces the actively misleading "Log entry not found".

The specific scenario this phase was written to fix still fails end-to-end — one layer deeper, with a worse message. It's untested: the integration suite (`tests/integration/routes/plans-authorization.test.ts:163,180`) only exercises `today`/existing dates, never the grace-window date, so nothing in CI catches this. `plan.md`'s "Migration Notes: None — ... this is application-layer validation logic only" was the flawed assumption that let this slip through planning.

**Fix A ⭐ Recommended**: Add a new migration widening all three `CHECK` constraints to `logged_at <= current_date + 1`, keeping the DB boundary exactly in lockstep with `isNotFutureDate`.
  - Strength: Directly closes the gap end-to-end; mechanical, small change (one migration, three `alter table ... drop constraint ... add constraint`); confirmed-UTC session timezone means `current_date + 1` aligns precisely with the app's boundary, no drift between layers.
  - Tradeoff: A production DB migration — needs `supabase db push` (now automated via the just-wired CI deploy step) and touches a live constraint on three tables.
  - Confidence: HIGH — the widening amount (`+1`) directly mirrors the already-approved app-layer decision; no new design choice, just propagate it.
  - Blind spot: None significant — session timezone was verified directly against the local instance.

**Fix B**: Drop the DB `CHECK` constraints entirely; rely solely on app-layer validation.
  - Strength: Eliminates the two-layers-must-stay-in-sync failure class going forward.
  - Tradeoff: Loses defense-in-depth — any future direct-DB path (script, admin tool, future client) would no longer have the future-date rule enforced at all.
  - Confidence: MEDIUM — reasonable, but a bigger philosophical change than this phase's stated scope ("application-layer validation logic only" was the plan's framing, not "remove DB-layer validation").
  - Blind spot: Haven't checked for any other code path that inserts into these tables directly (e.g. seed scripts, admin tooling) that might rely on the DB constraint as its only guard.

- **Decision**: FIXED (Fix A) — `supabase/migrations/20260830120000_widen_logged_at_future_checks_grace_window.sql`; verified locally that `logged_at = current_date + 1` now inserts successfully and `current_date + 2` still fails the CHECK constraint on all three tables.

### F2 — DB constraint violations misreported as "not found" on update routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/plans/[id]/logs/[logId]/update.ts:31-33`, `src/pages/api/measurements/[id]/update.ts:37-38`, `src/pages/api/calories/[id]/update.ts:31-32`

**Detail**: These routes conflate `error` (e.g. a constraint violation) with `data.length === 0` (row genuinely not found/not owned) into one "Log entry not found" message. Pre-existing, not introduced by this diff — but F1 is the first scenario that makes it fire in practice via a legitimate user action (editing a log to a grace-window date).

**Fix**: Once F1 is fixed, this stops being reachable for the date-boundary scenario; the underlying conflation is still worth a follow-up ticket (distinguish `error` from empty `data` with separate messages) but isn't blocking for this change.

- **Decision**: FIXED — split the `if (error || data.length === 0)` branch into a distinct `error` check (new "Could not update ...") and the original "Log entry not found" check, on all three update routes.

### F3 — No format guard on `logged_at` before string comparison

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/validation/training-plan.ts:16-19`, `src/lib/validation/measurements.ts:16-19`, `src/lib/validation/calories.ts:6-9`

**Detail**: `isNotFutureDate` string-compares `value` assuming `YYYY-MM-DD` format, with no `.regex()` guard before the `.refine()` call. Pre-existing (the old inline check had the same gap), not a regression. Low risk: the DB `date` column type rejects malformed values on insert, and `<input type="date">` always sends `YYYY-MM-DD`. Worth a `.regex(/^\d{4}-\d{2}-\d{2}$/)` guard only if this ever becomes a JSON API surface instead of form-only.

- **Decision**: SKIPPED — pre-existing, low risk, form-only surface today.

### F4 — Parameter naming inconsistency between the two date-utils functions

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/date-utils.ts:17` (`getWeekBounds(referenceDate: Date)`) vs `src/lib/date-utils.ts:49` (`isNotFutureDate(value: string, now: Date)`)

**Detail**: The reference-time parameter is named `referenceDate` in one function and `now` in the other. `now` arguably better reflects its actual role at call sites (`new Date()`), but it's an inconsistency within the same file.

- **Decision**: SKIPPED — trivial, not worth a rename.
