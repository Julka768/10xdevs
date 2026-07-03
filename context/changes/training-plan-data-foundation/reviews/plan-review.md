<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Training-Plan Data Foundation Implementation Plan

- **Plan**: context/changes/training-plan-data-foundation/plan.md
- **Mode**: Deep
- **Date**: 2026-07-03
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 0 warnings, 1 observation (both fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL → PASS after fix |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS after fix |
| Plan Completeness | PASS |

## Grounding

1/1 new-file path ✓ (supabase/migrations/ absent as expected — zero prior migrations confirmed), symbols ✓ (auth.users/auth.uid() confirmed live in src/lib/supabase.ts; CI confirmed to run lint+build only, no migrate/push step in .github/workflows/ci.yml), brief↔plan ✓, Progress↔Phase mechanical contract ✓ (6/6 criteria mapped, single Progress heading, plain bullets in phase body).

## Findings

### F1 — Migration is never applied to the environment the deployed app uses

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Desired End State / Success Criteria / Migration Notes
- **Detail**: Every success criterion verified against local Docker Postgres only (`supabase start`/`supabase db reset`). Nothing in the plan applied the migration to the actual remote Supabase project that `SUPABASE_URL`/`SUPABASE_KEY` (CI/deploy secrets in `.github/workflows/ci.yml`) point the deployed app at. Confirmed no `supabase link`/`supabase db push` step exists anywhere in the repo. This meant all success criteria could pass while F-01's stated goal ("unlocks S-01") remained false — S-01's UI/API would hit a live project missing these tables.
- **Fix A ⭐ Recommended**: Add an explicit manual step directing the implementer to `supabase link` + `supabase db push` (or Dashboard SQL editor) against every real environment before the change is done.
  - Strength: Minimal scope, no CI/CD edits, matches the roadmap's `speed` goal.
  - Tradeoff: Manual step repeats for every future migration (5 more tables) unless later formalized into CI.
  - Confidence: HIGH — standard, well-documented Supabase CLI workflow.
  - Blind spot: Doesn't verify which Supabase project (dev/staging/prod) the CI secrets currently point to.
- **Fix B**: Wire `supabase db push` into the CI `deploy` job with a new secret, so migrations auto-apply on merge.
  - Strength: Establishes the durable "migration ships on merge" pattern the roadmap implies will be needed 5 more times.
  - Tradeoff: Touches shared CI/CD infra, requires new secrets, no rollback story yet for a bad auto-applied migration.
  - Confidence: MEDIUM — technically simple but expands this change's declared scope.
  - Blind spot: Unclear whether the team wants migrations auto-applied pre-review or reviewed manually first.
- **Decision**: FIXED (via Fix A) — added remote-push step to Manual Verification, Migration Notes, and Progress (1.7).

### F2 — exercises.position has no positivity check

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — migration SQL, `exercises` table
- **Detail**: `target_sets`/`target_reps` both get `check (... > 0)`, but `position` was a bare `not null integer` — inconsistent with the plan's own "reject obviously-invalid rows" end state for this table.
- **Fix**: Add `check (position > 0)` to the `position` column definition, matching the pattern already used for `target_sets`/`target_reps`.
- **Decision**: FIXED — added `check (position > 0)` to the migration SQL and extended the corresponding manual-verification bullet to cover it.
