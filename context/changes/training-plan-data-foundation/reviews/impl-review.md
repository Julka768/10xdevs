<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Training-Plan Data Foundation

- **Plan**: context/changes/training-plan-data-foundation/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-07-03
- **Verdict**: NEEDS ATTENTION (F1 fixed in triage — see Decision below)
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Denormalized `exercises.user_id` allows plan-ownership mismatch (cross-tenant relationship injection / position-squatting)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; this table is the explicit template for five future domain tables, so the pattern is worth getting right before it's replicated
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260703121505_create_training_plan_schema.sql:56-58 (exercises INSERT policy), :60-63 (UPDATE policy), :33-43 (table def)
- **Detail**: `exercises.user_id` is denormalized from its parent plan (by design, per plan.md's "What We're NOT Doing"). The INSERT/UPDATE RLS policies only check `auth.uid() = user_id` — they never verify that `plan_id` actually belongs to a plan owned by that same user. The plan's own risk-acceptance text anticipated this ("could create an orphaned exercise row unreachable through normal own-plan queries") but a concrete, worse consequence wasn't considered: user B can insert an `exercises` row with `plan_id` pointing at user A's plan and `user_id = B`. This satisfies the FK and the RLS `with check`, and can squat on `(plan_id, position)` slots inside A's plan — A's own legitimate inserts at that position then fail with a `unique_violation`. It's a griefing/DoS vector, not a data leak (A still can't see B's row, since SELECT is filtered by `user_id = auth.uid()` not by plan ownership). No insert code path exists yet in this schema-only phase, so nothing is currently exploitable — this only matters once S-01 implements inserts. Practically it also requires guessing another user's plan UUID, which is infeasible.
- **Fix A ⭐ Recommended**: Harden the `exercises` INSERT/UPDATE policies with an `exists` subquery against `training_plans` to require `plan_id` to actually belong to `auth.uid()`, in addition to the existing `user_id` check.
  - Strength: Closes the gap at the DB layer regardless of what the app layer does later — consistent with "RLS is the safety net" and this table's job as the copy-paste template for workout logs/goals/calories/measurements tables; fixing it once here prevents propagating the same gap five more times.
  - Tradeoff: Slightly less "copy-paste simple" than the roadmap's stated goal for this template (adds a subquery instead of a flat equality check); minor policy-evaluation overhead (index-backed FK lookup, negligible at this scale).
  - Confidence: HIGH — standard Postgres RLS pattern for parent-ownership checks (`exists (select 1 from training_plans tp where tp.id = plan_id and tp.user_id = auth.uid())`).
  - Blind spot: Haven't verified whether this migration has already been pushed to a shared/remote environment in a way that makes an ALTER POLICY change disruptive (it has — confirmed pushed to the linked remote project) — but this is schema-only with zero dependent rows, so a corrective migration is safe to apply.
- **Fix B**: Leave RLS as-is per the plan's already-accepted risk, and require S-01's insert implementation to validate plan ownership at the application layer (fetch the plan by id + user first, 404/403 if not owned, before inserting the exercise).
  - Strength: Keeps this phase's schema unchanged (it already shipped and was pushed to remote); defers the fix to where the insert logic actually lives.
  - Tradeoff: The gap gets copy-pasted into every future child table unless each one remembers to add the app-layer check — easy to forget, and the DB layer alone can't be trusted to prevent it.
  - Confidence: MEDIUM — depends on S-01's implementer remembering this note; nothing enforces it structurally.
  - Blind spot: context/changes/create-and-manage-training-plan/plan.md (S-01, already in progress per the working tree) hasn't been checked for whether it already handles this.
- **Decision**: FIXED via Fix A — added corrective migration `supabase/migrations/20260703140000_harden_exercises_plan_ownership_rls.sql`, dropping and recreating `exercises_insert_own`/`exercises_update_own` with an `exists` subquery against `training_plans` requiring `plan_id` to belong to `auth.uid()`. Verified with `supabase db reset` (applies cleanly) and `supabase migration list` (shown as applied locally, not yet pushed to remote).

## Verification Log

### Automated

- `supabase start` — PASS (local stack running, Docker healthy)
- `supabase db reset` — PASS (fresh DB recreated, migration `20260703121505_create_training_plan_schema.sql` applied cleanly, containers restarted)
- `supabase migration list` — PASS (`20260703121505` shown as applied locally)
- `supabase migration list --linked` — PASS (bonus check beyond the plan's literal command: confirms the same migration is applied on the linked remote project `skxmmicrtvbvxvqazqqz`, corroborating Progress item 1.7)

### Manual (per Progress section)

- 1.4 RLS isolation (two users) — marked `[x]`. Not re-executed live in this review; corroborated by the implementation commit (bc697f3) message, which documents the GRANT-was-missing discovery — a failure mode only observable by actually running the test against a real Postgres instance, which is strong circumstantial evidence the manual test was genuinely performed rather than rubber-stamped.
- 1.5 CHECK constraint rejection — marked `[x]`, same corroboration as above; constraints present and correctly written in the migration (verified directly by Agent 2).
- 1.6 UNIQUE(plan_id, position) rejection — marked `[x]`, same corroboration; constraint present and correctly written.
- 1.7 Migration pushed to remote — marked `[x]` (no commit sha, consistent with being an out-of-band `db push` rather than a local commit). Independently confirmed in this review via `supabase migration list --linked` above.

## Notes

- GRANT + RLS pairing (the one existing entry in context/foundation/lessons.md, learned during this very change) was independently re-verified by Agent 2 against both tables: correct role (`authenticated` only), correct operations (all 4), present on both tables. No new finding — confirms the lesson was applied correctly.
- Position-assignment race condition under concurrent inserts (flagged by Agent 2 as an OBSERVATION) is not reported as a separate finding here — the plan's own "Critical Implementation Details" section already explicitly assigns this concern to the future insert-implementer (S-01) with the exact retry-on-`unique_violation` guidance. Re-flagging it would be noise; worth keeping in mind when reviewing S-01.
