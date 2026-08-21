<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Log Daily Calories Implementation Plan

- **Plan**: context/changes/log-daily-calories/plan.md
- **Scope**: Phase 3 of 3 (full plan review)
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Stricter not-future CHECK than sibling table has a UTC-vs-client-timezone edge case

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260821094132_create_calorie_logs_schema.sql:5
- **Detail**: `check (logged_at <= current_date)` evaluates in Postgres/UTC. A user in a timezone ahead of UTC picking their own "today" via the native date input could submit a date that's valid client-side (and passes the zod refine, which also computes "today" via `new Date().toISOString().slice(0,10)`) but still fails this DB-level check right at the UTC day boundary, surfacing only the generic `"Could not log calories"` redirect with no indication of why. Note this is not a new class of bug introduced by this plan — `workout_logs` carries the identical constraint (added in a follow-up migration, `20260703170111_add_workout_logs_logged_at_not_future_check.sql`) with the same generic-error behavior — but `calorie_logs` is the first table where this check ships in the *initial* migration by design (the plan explicitly cites closing the workout_logs PostgREST-bypass gap from day one).
- **Fix A ⭐ Recommended**: Leave as-is; this matches the accepted, already-shipped `workout_logs` precedent exactly, and the edge case (a write in the last-minutes-of-UTC-day window, from a timezone ahead of UTC) is narrow and already tolerated for workout logging.
  - Strength: Zero new work; consistent with an existing, deliberate design decision — the plan explicitly chose to replicate this constraint rather than diverge from the workout_logs precedent.
  - Tradeoff: The confusing generic-error UX (for the rare case it fires) persists, same as it already does for workout logs.
  - Confidence: HIGH — this is intentional replication of an already-accepted pattern, not a new gap.
  - Blind spot: No telemetry exists to confirm how often (if ever) real users hit this window.
- **Fix B**: Differentiate the error message when a Postgres constraint violation (vs. a zod validation failure) causes the redirect, across both `calorie_logs` and `workout_logs` routes.
  - Strength: Better UX for the rare edge case; would fix it for both tables at once.
  - Tradeoff: App-wide error-handling rework, out of scope for this single slice — every mutation route in the codebase currently redirects with the same generic pattern.
  - Confidence: MEDIUM — the fix shape is clear, but touching shared error-handling conventions has wider blast radius than this plan's scope.
  - Blind spot: Haven't surveyed every mutation route for how much rework this implies.
- **Decision**: ACCEPTED — matches the already-shipped `workout_logs` precedent; narrow edge case, no new work needed.

### F2 — `database.types.ts` table entry breaks alphabetical ordering

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/database.types.ts:23
- **Detail**: `calorie_logs` was inserted before `body_composition_goals`, breaking the otherwise-alphabetical table ordering the rest of the file follows (`body_composition_goals`, `exercises`, `training_plans`, `workout_logs`). This was a deliberate hand-edit (extending the file in place, following the precedent set by the `set-body-composition-goal` plan) rather than a full `supabase gen types` regeneration, matching the established convention for this file — but the insertion point wasn't alphabetized. No functional impact: Row/Insert/Update shapes were independently verified to correctly match the migration's column set.
- **Fix**: Move the `calorie_logs` block to sit alphabetically after `body_composition_goals` and before `exercises`.
- **Decision**: FIXED — reordered; `npm run lint` re-verified clean.

### F3 — No upper bound on logged calorie value

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/calories.ts:4
- **Detail**: `calories: z.coerce.number().int().positive()` has no ceiling; an extreme value would pass zod but could hit Postgres `integer` range limits, surfacing only the generic error. This mirrors the existing numeric-field style in `training-plan.ts` (e.g. `workoutLogInputSchema.weight`/`reps` are equally unbounded) — pre-existing app-wide convention, not a regression introduced here.
- **Decision**: NOTED — pre-existing app-wide convention, out of scope for this slice.

### F4 — No pagination on the calorie history list

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Architecture
- **Location**: src/pages/dashboard/calories/index.astro:15-21
- **Detail**: The full history is fetched and rendered unbounded, same as `dashboard/plans/[id].astro`'s workout-log query. Pre-existing app-wide gap that will scale poorly with usage, but out of scope for this slice (matches an established pattern, not a new one).
- **Decision**: NOTED — pre-existing app-wide gap, out of scope for this slice.

## Success Criteria Verification

**Automated** (re-verified during each phase's commit ritual; last run at Phase 3's commit `5c4e43d`, no code changed since):
- `npx supabase db reset` — PASS (migration applies cleanly)
- `npm run build` — PASS (no type errors)
- `npm run lint` — PASS (0 errors after the `database.types.ts` extension closed the `no-unsafe-*` errors that surfaced from the untyped `calorie_logs` query)

**Manual** (all 13 Progress manual items marked `[x]`, user-confirmed live in-browser after fixing an unrelated stale-Vite-dev-server issue that was blocking the delete button's island from hydrating):
- Phase 1 (1.4–1.6): RLS cross-user block, future-date CHECK rejection, multi-entry-per-day acceptance — confirmed.
- Phase 2 (2.3–2.6): future-date rejection, valid create, edit, delete — confirmed together with Phase 3 UI.
- Phase 3 (3.3–3.7): nav link, grouped totals, second-entry total update, inline edit/delete, cross-user isolation — confirmed.

No rubber-stamping concern: the diff contains direct evidence for every checked item (DeleteConfirmButton wiring, `?edit=` ternary, `reduce`-based daily total, RLS policies in the migration).
