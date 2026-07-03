<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Log Workout Against Plan Implementation Plan

- **Plan**: context/changes/log-workout-against-plan/plan.md
- **Mode**: Deep
- **Date**: 2026-07-03
- **Verdict**: REVISE (fixes applied during triage — see below)
- **Findings**: 1 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | PASS |

## Grounding

8/8 paths verified, 4/4 symbols verified, brief↔plan consistent.

Paths checked: `supabase/migrations/20260703121505_create_training_plan_schema.sql`, `supabase/migrations/20260703140000_harden_exercises_plan_ownership_rls.sql`, `src/pages/api/plans/[id]/exercises/index.ts`, `src/pages/api/plans/[id]/exercises/[exerciseId]/update.ts`, `src/pages/api/plans/[id]/exercises/[exerciseId]/delete.ts`, `src/pages/dashboard/plans/[id].astro`, `src/lib/validation/training-plan.ts`, `src/components/plans/DeleteConfirmButton.tsx`.

## Findings

### F1 — Update RLS policy doesn't enforce the plan's own "immutable after creation" invariant for plan_id/exercise_id/exercise_name

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, migration contract — `workout_logs_update_own` policy
- **Detail**: The update policy's `WITH CHECK` was only `auth.uid() = user_id`, unlike the insert policy which also checks plan/exercise ownership. `src/lib/supabase.ts` uses `SUPABASE_KEY` with `@supabase/ssr`'s cookie-based session — the same JWT that authorizes this app's own API routes also authorizes direct PostgREST calls. A user could call Supabase's REST API directly (bypassing the Astro app entirely) and UPDATE their own `workout_logs` row's `plan_id`/`exercise_id`/`exercise_name` to anything, violating the plan's stated "not user-editable after creation" invariant and risking the PRD guardrail "Logged data is never lost or corrupted" (`context/foundation/prd.md:37`). This is the same class of gap the plan's own "Key Discoveries" section cites as a prior — `exercises_update_own` needed a follow-up hardening migration for exactly this — but the lesson was only applied to the insert policy here, not the update policy.
- **Fix A ⭐ Recommended (Applied)**: Column-level GRANT restricting UPDATE to only `weight, reps, sets_completed, logged_at` — enforces immutability at the database boundary regardless of which client issues the UPDATE.
  - Strength: Matches the actual attack surface (PostgREST bypass), not just app-code discipline.
  - Tradeoff: A future feature needing to update `exercise_name` (e.g. rename propagation) would need to revisit the grant.
  - Confidence: HIGH — column-level privileges are standard Postgres/Supabase practice for this exact scenario.
  - Blind spot: None significant.
- **Fix B**: Add insert-style ownership `exists` checks to the update policy's `WITH CHECK`.
  - Strength: Symmetric with the insert policy already written.
  - Tradeoff: Still allows re-pointing to the user's own other plans/exercises; can't cover `exercise_name` at all.
  - Confidence: MEDIUM — narrower than the invariant the plan states.
  - Blind spot: `exercise_name` remains open to tampering either way.
- **Decision**: FIXED (via Fix A) — plan.md Phase 1 migration contract updated to split the GRANT and document the reasoning.

### F2 — "No future dates" check has an unstated timezone basis

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, item 1 — validation schema
- **Detail**: `logged_at` was specified as `z.coerce.date()` refined to `<= today` without pinning the comparison basis — comparing full `Date` objects against a server-side `new Date()` (UTC in the Workers runtime) risks a timezone-dependent off-by-one near midnight for users outside UTC.
- **Fix**: Compare as UTC date-only strings (`YYYY-MM-DD`) on both sides instead of `Date` object `<=`.
- **Decision**: FIXED — plan.md Phase 2 validation schema contract updated.
