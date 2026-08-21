# Weekly Progress Report — Plan Brief

> Full plan: `context/changes/weekly-progress-report/plan.md`

## What & Why

Give users a weekly report comparing training volume (per exercise), body measurement deltas, and calorie intake vs. their stated goal — current calendar week vs. the prior week. This closes FR-008, the last unimplemented functional requirement in the MVP.

## Starting Point

All four data-producing slices this report reads from (`workout_logs`, `body_measurements`/`measurement_values`, `calorie_logs`, `body_composition_goals`) are shipped and RLS-isolated. No week-boundary or report logic exists anywhere yet — this is the first slice of this shape (pure read/compute, zero new tables).

## Desired End State

A user opens `/dashboard/report` and sees three sections — training volume per exercise, measurement deltas (weight + any circumference/custom types they track), and calorie intake vs. their goal — each showing up/down/flat trends, with each section independently showing "not enough data yet" if either week is missing for that category. The dashboard hub gets three compact trend badges and a nav link.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Week boundary | Fixed calendar week (Mon-Sun) | Matches PRD's "report they open at the end of each week" framing directly | Plan (user answer) |
| Training volume formula | weight × reps × sets, summed per exercise | Standard strength-training volume definition, uses all three logged fields | Plan (user answer) |
| Calorie-vs-goal logic | Week-over-week trend judged against goal direction | No target-calorie field exists anywhere; reopening S-03 to add one was rejected as scope creep | Plan (user answer) |
| Measurement scope | Weight + all logged types (built-in + custom) | Consistent with S-05's flexible model; report reflects what the user actually tracks | Plan (user answer) |
| Exercise matching | By `exercise_name`, not `exercise_id` | Matches the snapshot-on-delete design already established in `workout_logs` (S-02) | Plan (user answer) |
| Empty-state gating | Per-category, not all-or-nothing | A user who skipped one category still gets value from the other two | Plan (user answer) |
| "Flat" threshold | Exactly zero change only | No magic percentage number with no basis in the PRD or codebase | Plan (user answer) |
| Report scope | Current vs. prior week only, no history navigation | Matches literal PRD framing; avoids unrequested week-picker UI | Plan (user answer) |
| Dashboard hub | Three independent compact badges (training/weight/calories) | User asked for a hub signal; a single fused arrow would require inventing a tie-break rule with no basis anywhere | Plan (user answer + design refinement) |
| Multi-entry-per-week value | Most recent entry in the week (not averaged) | Point-in-time body measurements aren't meaningfully averaged across a week | Plan |
| Calorie averaging | Sum/count over logged days only, never `/7` | No reasonable way to impute a missing day's intake without fabricating data | Plan |

## Scope

**In scope:**
- `date-utils.ts` week-boundary helper (first in this codebase)
- `weekly-report.ts` pure comparison functions (volume, measurement deltas, calorie alignment)
- `/dashboard/report` page with three independently-gated sections
- Dashboard hub: nav link + three compact trend badges

**Out of scope:**
- Any new table or migration
- Report history / week navigation
- Target-calorie field on goals (would reopen closed S-03)
- Percentage-based "flat" threshold
- A single fused overall-trend arrow

## Architecture / Approach

Pure computation (Phase 1) separated from I/O (Phase 2), matching the codebase's existing convention that all Supabase calls happen in page frontmatter, not lib modules — and directly setting up `context/foundation/test-plan.md` §3 Phase 2's future unit tests, which need exactly this kind of testable function.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Computation | Week-boundary math + three pure comparison functions, with real Vitest unit tests against hand-computed fixtures | Getting the volume formula / week boundary / calorie-alignment logic right — mitigated by the unit tests themselves |
| 2. UI | Report page + dashboard badges | Per-category empty-state logic and cross-account isolation across four source tables |

**Prerequisites:** S-02, S-03, S-04, S-05 (all shipped and closed).
**Estimated effort:** ~1 session across 2 phases — smaller code footprint than the CRUD slices since there's no schema/API layer.

## Open Risks & Assumptions

- **Correction**: Vitest is already installed (from the completed `testing-critical-path-integrity` phase) — Phase 1 now includes real unit tests against independently hand-computed fixtures, directly fulfilling `test-plan.md` §3 Phase 2 rather than deferring it.
- The dashboard badge design (three independent indicators) is a refinement of what was asked for ("a compact trend marker") — flagged explicitly in case a single fused arrow was actually expected.

## Success Criteria (Summary)

- A user with two weeks of real data sees accurate up/down/flat trends across all three categories, matching hand-calculation.
- A user missing data in one category still gets full value from the other two (no all-or-nothing blocking).
- No user ever sees another account's data in their report or dashboard badges.
