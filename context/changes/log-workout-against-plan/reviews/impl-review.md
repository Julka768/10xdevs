<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Log Workout Against Plan Implementation Plan

- **Plan**: context/changes/log-workout-against-plan/plan.md
- **Scope**: Phase 3 of 3 (full plan)
- **Date**: 2026-07-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Plan-drift sub-agent: all 7 changed source/schema files verified byte-for-byte against their Phase 1–3 contracts (migration shape/GRANTs/RLS, zod schema's UTC-string date comparison, create route's server-side `exercise_name` lookup, update/delete routes' RLS-only ownership, UI query-param pattern and frontmatter-level date grouping). No DRIFT, MISSING, or EXTRA files. `git diff --name-only 034f628..5f5cb66` matches the plan's file list exactly (plus expected context/ docs). "What We're NOT Doing" boundaries respected.
- Safety/pattern sub-agent: no injection risks, no missing authn/authz at the 3 new route boundaries, no substantive pattern mismatches vs. the sibling `exercises` routes/migrations.
- Automated success criteria re-verified this session: `npm run build` and `npm run lint` both pass.
- Manual success criteria: all 16 Progress checkboxes across 3 phases carry direct evidence, not rubber-stamped — Phase 1's RLS/ownership/cascade behavior was verified via `docker exec` psql sessions simulating both users' JWT claims; Phases 2–3's route and UI behavior (future-date rejection, valid insert, edit scoping, delete, exercise-deletion survival, cross-user isolation) was verified via a real signed-in curl session against the running dev server and local Postgres, with before/after row inspection. Test fixtures were cleaned up and the local DB reset afterward.

## Findings

### F1 — INSERT policy doesn't verify `exercise_name` matches the referenced exercise's actual name

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260703161941_create_workout_logs_schema.sql:85-100` (`workout_logs_insert_own` policy)
- **Detail**: The insert policy's `with check` verifies `exercise_id` belongs to an exercise the user owns in the same plan, but never verifies that the client-supplied `exercise_name` actually matches that exercise's `name` column. `src/pages/api/plans/[id]/exercises/[exerciseId]/logs.ts` always fetches and uses the real name, so this app's own UI can't trigger it — but a direct PostgREST insert with the user's own valid session (same threat model the column-scoped UPDATE grant was built to close per plan review finding F1) could set an arbitrary `exercise_name` alongside a legitimate `exercise_id`, desyncing a user's own history display from their exercise record. This is self-inflicted data corruption (scoped to the attacker's own rows, not cross-user), not a security boundary breach.
- **Fix A ⭐ Recommended**: Accept as-is — the blast radius is limited to a user corrupting their own log display text, the app layer already writes the correct value on every path, and closing this fully would require a trigger (RLS `with check` can't subquery-join against another table's current value in a way that's meaningfully different from what's already checked for `exercise_id` ownership — the gap is specifically "does the string match", which needs a `BEFORE INSERT` trigger, not a policy tweak).
  - Strength: No new migration/trigger surface for a self-only, cosmetic-at-worst gap; matches the plan's explicit scope ("no changes to `exercises` deletion behavior" mindset — this table's job is to survive exercise changes, not police name consistency).
  - Tradeoff: A determined user could make their own workout history display a misleading exercise name for a real `exercise_id`.
  - Confidence: MED — reasonable given the threat model, but this is a judgment call about how much direct-API abuse this app should defend against for self-owned data.
  - Blind spot: Haven't checked whether S-06 (future weekly report/aggregation slice) will read `exercise_name` in a context where this desync would matter more (e.g. cross-referencing against exercise IDs).
- **Fix B**: Add a `BEFORE INSERT` trigger on `workout_logs` that re-fetches `exercises.name` for the given `exercise_id` and overwrites/validates `exercise_name` server-side.
  - Strength: Closes the gap completely at the DB boundary, consistent with this migration's overall philosophy of not trusting the app layer alone.
  - Tradeoff: New trigger to write, test, and maintain for a self-only cosmetic issue; adds complexity disproportionate to the risk.
  - Confidence: MED — technically sound but likely overkill for the actual risk.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix A) — blast radius limited to the user's own data; app layer already writes the correct value on every path.

### F2 — No DB-level guard against future-dated `logged_at`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/validation/training-plan.ts:11-18`; `supabase/migrations/20260703161941_create_workout_logs_schema.sql:8` (`logged_at` column)
- **Detail**: The "no future dates" rule lives only in the zod schema (verified working via the future-date test). Unlike `weight > 0` / `reps > 0` / `sets_completed > 0`, which are enforced both in zod and as table `CHECK` constraints, `logged_at` has no matching DB-level guard — a direct API insert could set a future date. The plan never specified a DB check for this (it's a deliberate app-layer-only design), so this isn't drift, just a residual gap worth naming.
- **Fix**: If this table sees direct API usage beyond this app's own routes, add `check (logged_at <= current_date)` in a follow-up migration.
- **Decision**: FIXED — added `supabase/migrations/20260703170111_add_workout_logs_logged_at_not_future_check.sql`, verified it blocks a future-dated insert and allows today's date; `npm run build`/`npm run lint` re-verified.

### F3 — Column-scoped UPDATE grant isn't documented inline with a comment

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `supabase/migrations/20260703161941_create_workout_logs_schema.sql:18-19`
- **Detail**: The split GRANT (`select, insert, delete` broad + `update (weight, reps, sets_completed, logged_at)` column-scoped) is exactly the plan-review-mandated fix (F1 in `reviews/plan-review.md`) and is correctly implemented, but unlike `20260703140000_harden_exercises_plan_ownership_rls.sql`, which has a header comment explaining the reasoning for its RLS change, this migration has no comment recording *why* the UPDATE grant is column-scoped. A future maintainer adding a legitimate need to update `exercise_name` (e.g. rename propagation) could broaden the grant without realizing it was deliberately narrow.
- **Fix**: Add a one-line comment above the GRANT statements referencing the immutability invariant, mirroring the style of the `exercises` hardening migration's header comment.
- **Decision**: FIXED — added comment to `20260703161941_create_workout_logs_schema.sql` above the GRANT statements; re-applied `npx supabase db reset` to confirm no drift.
