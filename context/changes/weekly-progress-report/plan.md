# Weekly Progress Report Implementation Plan

## Overview

Add a read-only weekly report comparing training volume (per exercise), body measurement deltas (weight + any circumference/custom types the user logs), and calorie intake against the user's stated goal — current calendar week vs. the immediately prior week. This closes FR-008, the last unimplemented functional requirement in the MVP roadmap.

## Current State Analysis

Every prior domain slice (`workout_logs`, `body_measurements`/`measurement_values`, `calorie_logs`, `body_composition_goals`) is now shipped and RLS-isolated per user. This slice adds **no new table and no migration** — it is a pure read/compute feature layered on top of existing data, the first slice of this shape in the codebase. Every existing page performs its Supabase queries directly in `.astro` frontmatter (no lib module currently wraps a Supabase call); this plan continues that convention — the new lib module in Phase 1 is pure computation (no I/O), and Phase 2's page performs the queries.

No week-boundary logic exists anywhere in the codebase (confirmed during `log-weekly-measurements` planning) — this plan introduces the first one.

### Key Discoveries:

- `supabase/migrations/20260703161941_create_workout_logs_schema.sql` — `workout_logs` snapshots `exercise_name` (text, never null) alongside a nullable `exercise_id` specifically so historical entries survive exercise deletion/rename. This plan's per-exercise volume grouping must key on `exercise_name`, not `exercise_id`, to stay consistent with that design.
- `src/pages/dashboard.astro:9-16` — the existing "current goal" query pattern (`order("created_at", { ascending: false }).limit(1).maybeSingle()`) is the template for reading the append-only `body_composition_goals` table; this plan reuses it as-is for the goal-alignment input.
- **Correction from initial research**: Vitest is already installed and configured (`vitest.config.ts`, `package.json`'s `test:integration` script) from the completed `testing-critical-path-integrity` rollout phase — there IS a test runner in this project. Only integration tests exist so far (`tests/integration/**/*.test.ts`, real local Supabase + two-seeded-user fixtures); no unit tests exist yet. `vitest.config.ts`'s `include` currently only matches `tests/integration/**`, so a new `tests/unit/` directory needs the config's `include` broadened or it silently won't run.
- `context/foundation/test-plan.md` §3 Phase 2 ("Weekly report correctness") and §2 Risk #5 describe exactly this computation's correctness risk, with a concrete verification bar: *"the report's per-exercise trend, each measurement delta, and the calorie-vs-goal verdict match independently hand-computed values"* and an explicit anti-pattern to avoid: *"Deriving 'expected' test values by reading the implementation's own formula."* This plan folds that rollout phase's work directly into Phase 1 (real Vitest unit tests, not deferred) rather than opening it as a separate change — the fixture values and their independently-computed expected outputs are specified below precisely so the implementer isn't the one deriving both.
- `src/pages/dashboard/measurements/index.astro` (from `log-weekly-measurements`) — the `measurement_values` → `measurement_types` relationship and the two-step flat-query pattern (fetch owning rows, then fetch related rows by id list) is the precedent to follow here too, rather than a PostgREST embedded-resource join (which no page in this codebase uses).

## What We're NOT Doing

- No new database table or migration — this is compute-over-existing-data only.
- No navigable report history (week picker) — only current week vs. prior week, per explicit decision. A user cannot browse older weeks' reports.
- No target-calorie number added to goal-setting (`body_composition_goals`/S-03) — calorie-vs-goal alignment is inferred from the week-over-week intake trend, not from reopening the already-shipped S-03 slice.
- No percentage-based "flat" threshold — exactly-zero-change is the only case classified as flat; any nonzero change is up or down.
- No imputing missing days into calorie/measurement averages — only days/entries that actually exist are counted.
- No single fused "overall trend" arrow on the dashboard — the three dashboard badges (training/weight/calories) are independent signals, not synthesized into one.

## Implementation Approach

Two phases: pure computation logic first (date/week-boundary math + the three comparison functions), then the UI that queries the four source tables, calls those functions, and renders the report page plus three compact dashboard badges.

## Critical Implementation Details

### Week-boundary math (Monday-start)

`Date.prototype.getDay()` returns `0` for Sunday, `1`–`6` for Monday–Saturday — there is no built-in "days since Monday." The offset to the most recent Monday is `(day + 6) % 7`:

```ts
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7; // Sun(0)->6, Mon(1)->0, ... Sat(6)->5
  d.setDate(d.getDate() - offset);
  return d;
}
```

Current week = `[mondayOf(today), mondayOf(today) + 6d]`; prior week = the 7 days immediately before that. All boundaries are computed as `YYYY-MM-DD` strings (via `toISOString().slice(0, 10)`, matching the date-string convention used everywhere else in this codebase) so they compare directly against the `date`-typed `logged_at` columns.

### Representative value for a metric logged multiple times in one week

`body_measurements` (and by extension `measurement_values`) allows unlimited entries per week — S-05 deliberately does not enforce cadence. For each metric (weight, and each circumference/custom type), this plan uses the **most recently logged entry within that week** (by `logged_at` desc, then `created_at` desc) as that week's representative value — not an average. Averaging a point-in-time body measurement across a week doesn't correspond to how anyone actually weighs in; "most recent snapshot" is the natural reading and matches how `dashboard.astro`'s existing "latest measurement" teaser already picks a single representative row.

### Calorie averaging over logged days only

A week's "average daily calories" is `sum(calories for days with at least one entry) / count(distinct days with an entry)` — never `/7`. A week with 2 logged days and a week with 7 logged days are both valid, just less/more complete; there is no reasonable way to impute a missing day's intake without fabricating data, which the PRD's data-integrity guardrail argues against.

### Calorie-vs-goal alignment logic

There is no target-calorie number anywhere in this data model (`body_composition_goals.goal_type` is just `lose | gain | maintain`). Alignment is inferred by comparing this week's average daily calories against the prior week's, then judging the resulting direction against the goal:

| `goal_type` | Aligned when trend is | Not aligned when trend is |
|---|---|---|
| `lose` | `down` or `flat` | `up` |
| `gain` | `up` or `flat` | `down` |
| `maintain` | `flat` | `up` or `down` |

If no goal is set, or either week has zero calorie entries, alignment is `null` (unknown), not `false`.

## Phase 1: Report computation — date utilities and comparison logic

### Overview

Pure, I/O-free functions: week-boundary computation and the three comparison computations (training volume, measurement deltas, calorie-vs-goal alignment). No Supabase calls in this phase — the functions accept already-fetched row arrays.

### Changes Required:

#### 1. Week-boundary helper

**File**: `src/lib/date-utils.ts`

**Intent**: Compute the current-week and prior-week `[start, end]` date-string boundaries (Monday-Sunday) relative to a reference date, per the Critical Implementation Details algorithm above.

**Contract**: Export `getWeekBounds(referenceDate: Date): { currentWeekStart: string; currentWeekEnd: string; priorWeekStart: string; priorWeekEnd: string }`, all four values as `YYYY-MM-DD` strings.

#### 2. Report comparison functions

**File**: `src/lib/weekly-report.ts`

**Intent**: Turn already-fetched rows from the four source tables into the report's comparison data, using the representative-value/averaging/alignment rules from Critical Implementation Details.

**Contract**: Export a shared `type TrendDirection = "up" | "down" | "flat"` and a `compareValues(current: number | null, prior: number | null): TrendDirection | null` helper (exact-zero-diff = `flat`; either input `null` = `null`/no-data). Export three functions:
- `computeVolumeComparison(logs: WorkoutLogRow[], bounds): Array<{ exerciseName: string; currentVolume: number | null; priorVolume: number | null; trend: TrendDirection | null }>` — groups `logs` by `exercise_name`, sums `weight * reps * sets_completed` per group per week (current vs. prior), one row per exercise name seen in either week.
- `computeMeasurementDeltas(measurements: BodyMeasurementRow[], customValues: { measurementId: string; typeId: string; value: number }[], customTypes: { id: string; name: string }[], bounds): Array<{ label: string; current: number | null; prior: number | null; trend: TrendDirection | null }>` — one row for `weight`, one per circumference field with at least one non-null value in either week, one per custom type with a value in either week; each uses the "most recent entry in that week" rule.
- `computeCalorieAlignment(calorieLogs: CalorieLogRow[], goalType: "lose" | "gain" | "maintain" | null, bounds): { currentAvgDaily: number | null; priorAvgDaily: number | null; trend: TrendDirection | null; aligned: boolean | null }` — per the alignment table above.

#### 3. Vitest config: pick up unit tests

**File**: `vitest.config.ts`

**Intent**: Make the new `tests/unit/**` directory actually run — it currently only matches `tests/integration/**`.

**Contract**: Broaden `test.include` from `["tests/integration/**/*.test.ts"]` to `["tests/**/*.test.ts"]` (matches both `tests/unit/` and `tests/integration/`, no other config changes needed — unit tests need no DB/env setup, so the existing `environment: "node"` and `loadEnv` config is harmless for them).

#### 4. Test scripts

**File**: `package.json`

**Intent**: Let unit tests and integration tests be run independently (unit tests need no local Supabase instance; integration tests do), while a bare `vitest run` still runs everything.

**Contract**: Add `"test:unit": "vitest run tests/unit"` alongside the existing `"test:integration": "vitest run tests/integration"` (both now explicit paths, so each still runs only its own directory even though the config's `include` covers both).

#### 5. Unit tests: week-boundary helper

**File**: `tests/unit/date-utils.test.ts`

**Intent**: Verify `getWeekBounds` against hand-computed boundaries, independent of the implementation.

**Contract**: Using reference date `2026-08-21` (a Friday — independently verified: 2026-01-01 is a Thursday, and day-233 of a non-leap year lands on Friday), assert:
- `currentWeekStart === "2026-08-17"`, `currentWeekEnd === "2026-08-23"` (the Monday-Sunday containing the reference date)
- `priorWeekStart === "2026-08-10"`, `priorWeekEnd === "2026-08-16"` (the 7 days immediately before)

Plus two boundary cases: reference date `2026-08-17` (itself a Monday) should yield the *same* `currentWeekStart` (offset must be `0`, not wrap to the following Monday); reference date `2026-08-23` (a Sunday) should yield `currentWeekStart === "2026-08-17"` (Sunday belongs to the week that started the preceding Monday, not a new one).

#### 6. Unit tests: report comparison functions

**File**: `tests/unit/weekly-report.test.ts`

**Intent**: Verify each comparison function against fixture data with independently hand-computed expected outputs (per test-plan.md's explicit anti-pattern warning — do not derive "expected" by reading `weekly-report.ts`'s own formula).

**Contract**: Use the reference week from the date-utils test above (`current` = Aug 17-23, `prior` = Aug 10-16). Fixture rows and their hand-computed expectations:

*Volume* (`computeVolumeComparison`) — four `workout_logs` rows:
| exercise_name | logged_at | weight | reps | sets_completed |
|---|---|---|---|---|
| Bench Press | 2026-08-11 (prior) | 100 | 5 | 3 |
| Bench Press | 2026-08-13 (prior) | 100 | 5 | 2 |
| Bench Press | 2026-08-18 (current) | 110 | 5 | 5 |
| Squat | 2026-08-12 (prior) | 80 | 8 | 4 |
| Squat | 2026-08-19 (current) | 80 | 8 | 4 |
| Deadlift | 2026-08-20 (current) | 120 | 3 | 3 |

Expected: Bench Press prior = `100*5*3 + 100*5*2 = 2500`, current = `110*5*5 = 2750`, trend `"up"`. Squat prior = current = `80*8*4 = 2560`, trend `"flat"`. Deadlift prior = `null` (no prior-week rows), current = `1080`, trend `null`.

*Measurement deltas* (`computeMeasurementDeltas`) — `body_measurements` rows: weight `80.0` on 2026-08-12 (prior), `79.5` on 2026-08-14 (prior, later — this is the representative prior value), `79.0` on 2026-08-19 (current); `waist` `90` on 2026-08-12 (prior only, no current entry). Plus a custom type "Neck" via `measurement_values`: `38` in the prior-week row, `38` in the current-week row.

Expected: weight row — prior = `79.5` (the later of the two prior entries, not `80.0`), current = `79.0`, trend `"down"`. waist row — prior = `90`, current = `null`, trend `null`. Neck row — prior = current = `38`, trend `"flat"`.

*Calorie alignment* (`computeCalorieAlignment`) — four scenarios, each a fresh fixture:
1. `goalType: "lose"`, prior week 3 entries summing to `6000` (avg `2000`), current week 2 entries summing to `3600` (avg `1800`) → trend `"down"`, `aligned: true`.
2. `goalType: "maintain"`, prior avg `2200`, current avg `2200` → trend `"flat"`, `aligned: true`.
3. `goalType: "gain"`, prior avg `2500`, current avg `2400` → trend `"down"`, `aligned: false`.
4. `goalType: null` (no goal set), any entries → `aligned: null` regardless of trend.
5. Current week has zero calorie entries → `currentAvgDaily: null`, trend `null`, `aligned: null`.

#### 7. Fix stale "no test suite" doc line

**File**: `CLAUDE.md`

**Intent**: `CLAUDE.md`'s Commands section still says "No test suite exists yet," which has been false since `testing-critical-path-integrity` shipped the integration suite — this plan adds unit tests on top, making the line doubly stale.

**Contract**: Replace `- No test suite exists yet.` with two lines: `- `npm run test:unit` — Vitest unit tests (`tests/unit/`, no external services needed)` and `- `npm run test:integration` — Vitest integration tests (`tests/integration/`, requires local Supabase via `supabase start`)`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`

#### Manual Verification:

- (None — Phase 1 has no UI; its correctness is fully covered by the automated unit tests above, which is the point of keeping these functions pure.)

---

## Phase 2: UI — report page and dashboard trend badges

### Overview

Query the four source tables for the two-week date range, call Phase 1's functions, and render the report as three sections (training / measurements / calories-vs-goal), each with its own empty state. Add a nav link and three compact trend badges to the dashboard hub.

### Changes Required:

#### 1. Report page

**File**: `src/pages/dashboard/report.astro`

**Intent**: Show the current-vs-prior-week comparison across all three categories, each independently showing its own "no data yet" state when either week lacks entries for that category — per the explicit per-category (not all-or-nothing) empty-state decision.

**Contract**: Frontmatter computes `bounds` via `getWeekBounds(new Date())`, then issues one flat query per source table across `[priorWeekStart, currentWeekEnd]` (`workout_logs`, `body_measurements`, `calorie_logs`), plus the existing "current goal" query pattern from `dashboard.astro`. For custom-type values: first collect the `body_measurements` ids in range, then a second flat query on `measurement_values` filtered by `.in("measurement_id", ids)` — two-step flat queries, no embedded/join select, per Key Discoveries. Passes the fetched rows into Phase 1's three functions and renders their output: a table/list per category (exercise name + current/prior/trend-arrow; measurement label + current/prior/trend-arrow; calorie average + trend + aligned yes/no/unknown). Same `Layout`/back-link/`ServerError` wrapper as every other dashboard sub-page.

#### 2. Dashboard hub — nav link + trend badges

**File**: `src/pages/dashboard.astro`

**Intent**: Surface a compact, at-a-glance signal for each of the three categories and link into the full report.

**Contract**: Reuses the same four queries and Phase 1 functions (or a lightweight re-fetch scoped to just what's needed for the badges — implementer's call, whichever avoids duplicating the two-step measurement_values fetch unnecessarily). Renders three small badges — Training (aggregate trend across exercises, or "—" if no data), Weight (`computeMeasurementDeltas`'s `weight` row trend), Calories vs goal (✓ aligned / ✗ not aligned / "—" unknown) — as independent indicators, not one fused arrow, per Critical Implementation Details. Adds a fifth nav `<a href="/dashboard/report" ...>` card into the existing nav row, styled identically to the other four links.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit` (extended in this phase with `aggregateTrend` coverage for the dashboard badges)

#### Manual Verification:

- With two weeks of seeded workout/measurement/calorie data across two test accounts, the report correctly shows up/down/flat per category and never mixes one account's data into the other's report.
- A category with data in the current week but none in the prior week shows that category's own "not enough data yet" state, while the other categories (if they have both weeks' data) still render normally.
- The three dashboard badges match the report page's own computed trends.
- Nav link navigates to `/dashboard/report`.
- A fresh account with zero logged data shows "no data yet" in all three sections and all three dashboard badges show "—", with no errors.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/date-utils.test.ts` and `tests/unit/weekly-report.test.ts` — see Phase 1 items 5-6 for the exact fixtures and independently hand-computed expected values. These are the first unit tests in this project (Vitest was already installed by `testing-critical-path-integrity`, but only for integration tests) and directly fulfill `context/foundation/test-plan.md` §3 Phase 2 ("Weekly report correctness") and §2 Risk #5, folded into this plan rather than opened as a separate change.

### Integration Tests:

- None added by this plan. The existing `tests/integration/` suite covers RLS/ownership at the table level for the four source tables already; this plan reads from them but doesn't add new mutations or new RLS surface, so there's no new integration-test surface to cover here.

### Manual Testing Steps:

1. Seed two accounts with workout/measurement/calorie entries spanning a current and prior calendar week (varying up/down/flat per category).
2. Open `/dashboard/report` on both accounts; confirm each sees only their own data and correct trend directions.
3. Log a measurement twice in the same week; confirm the report uses only the most recent value.
4. Verify a goal of each type (lose/gain/maintain) against a rising, falling, and flat calorie trend to confirm all 9 alignment combinations from the Critical Implementation Details table.
5. Check the dashboard badges match the report page for the same account.
6. Check a brand-new account with no data at all renders cleanly (no crashes, all "no data" states).

## Performance Considerations

Query volume is small and bounded (two weeks of one user's data across four tables) — no pagination or caching needed at this app's stated scale (`target_scale.data_volume: small` in the PRD).

## Migration Notes

None — no schema changes.

## References

- Snapshot-on-delete design: `supabase/migrations/20260703161941_create_workout_logs_schema.sql` (exercise_name rationale)
- Two-step flat-query precedent: `src/pages/dashboard/measurements/index.astro` (`log-weekly-measurements`)
- Current-goal query pattern: `src/pages/dashboard.astro:9-16`
- Test rollout this phase fulfills: `context/foundation/test-plan.md` §2 Risk #5, §3 Phase 2
- Existing Vitest setup: `vitest.config.ts`, `tests/integration/support/` (fixture/seed helpers — not needed by this plan's unit tests, but the reference point for this project's test conventions)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Report computation — date utilities and comparison logic

#### Automated

- [x] 1.1 Build passes: `npm run build` — 68d1978
- [x] 1.2 Lint passes: `npm run lint` — 68d1978
- [x] 1.3 Unit tests pass: `npm run test:unit` — 68d1978

### Phase 2: UI — report page and dashboard trend badges

#### Automated

- [x] 2.1 Build passes: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Unit tests pass: `npm run test:unit` (extended in this phase with `aggregateTrend` coverage for the dashboard badges)

#### Manual

- [ ] 2.4 Correct up/down/flat per category with cross-account isolation
- [ ] 2.5 Per-category empty state independent of other categories
- [ ] 2.6 Dashboard badges match report page's computed trends
- [ ] 2.7 Nav link navigates to `/dashboard/report`
- [ ] 2.8 Fresh account with zero data renders cleanly, no errors
