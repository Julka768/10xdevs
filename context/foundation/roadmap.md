---
project: "10xDevBodyMetrics"
version: 1
status: draft
created: 2026-07-02
updated: 2026-07-04
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xDevBodyMetrics

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Gym-goers currently track lifting, body measurements, and calories in separate single-purpose apps, re-entering context each time and never seeing training, body change, and diet as one picture. 10xDevBodyMetrics proves that putting all three in one place — with workouts logged against the user's own training plan — already removes that app-juggling cost, before any AI coaching is added post-MVP.

## North star

**S-02: User logs a workout session against their own training plan** — this is the smallest end-to-end flow that proves the core hypothesis: that logging *against your own plan* (not a generic tracker) is what makes unified tracking valuable. It is the only fully-specified user story in the PRD (US-01) and the literal core of the "unified tracking" pitch.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the product's core hypothesis — sequenced as early as its own prerequisites allow, because every other slice only matters if this one lands.

## At a glance

| ID   | Change ID                          | Outcome (user can …)                                             | Prerequisites          | PRD refs             | Status   |
| ---- | ----------------------------------- | ------------------------------------------------------------------ | ----------------------- | --------------------- | -------- |
| F-01 | training-plan-data-foundation       | (foundation) Supabase schema + RLS pattern for plans/exercises     | —                        | FR-002, FR-003         | done     |
| S-01 | create-and-manage-training-plan     | create, view, edit, and delete exercises in a training plan        | F-01                    | FR-002, FR-003         | done     |
| S-02 | log-workout-against-plan            | log a workout session (exercise, weight, reps) against their plan  | S-01                    | US-01, FR-001, FR-005  | done     |
| S-03 | set-body-composition-goal           | set and edit a body-composition goal at any time                   | —                        | FR-004                 | done     |
| S-04 | log-daily-calories                  | log calories consumed for a given day                              | —                        | FR-006                 | done     |
| S-05 | log-weekly-measurements             | log body measurements on a weekly cadence                          | —                        | FR-007                 | ready    |
| S-06 | weekly-progress-report              | view a weekly report: training volume, measurement deltas, calories vs. goal | S-02, S-03, S-04, S-05  | FR-008                 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                                    | Note                                                                                   |
| ------ | ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| A      | Plan & workout core loop  | `F-01` → `S-01` → `S-02` → `S-06`         | Carries the north star (`S-02`); `S-06` joins here since it also needs `S-03`/`S-04`/`S-05`. |
| B      | Goal setting               | `S-03`                                    | Independent single-slice track; feeds the goal comparison in `S-06`.                    |
| C      | Calorie logging            | `S-04`                                    | Independent single-slice track; feeds `S-06`. Parallel with `S-01`–`S-03`, `S-05`.       |
| D      | Measurement logging        | `S-05`                                    | Independent single-slice track; feeds `S-06`. Parallel with `S-01`–`S-04`.               |

## Baseline

What's already in place in the codebase as of `2026-07-02` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 + React 19 islands scaffolded (`src/components/`, `src/layouts/Layout.astro`); no domain UI yet beyond auth forms and the empty `/dashboard` shell.
- **Backend / API:** partial — `src/pages/api/auth/{signin,signout,signup}.ts` establish the API route pattern; no domain API routes yet.
- **Data:** partial — F-01 landed `supabase/migrations/20260703121505_create_training_plan_schema.sql` (training_plans/exercises schema + RLS); no other domain tables (workout logs, goals, calories, measurements) yet.
- **Auth:** present — full email+password flow wired (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*.ts`, `src/pages/auth/{signin,signup,confirm-email}.astro`). FR-001 is already satisfied.
- **Deploy / infra:** present — Wrangler/Workers configured; `.github/workflows/ci.yml` has both `ci` and `deploy` jobs wired, auto-deploy-on-merge to `master`.
- **Observability:** absent — no error-tracking/logging library; `wrangler tail` is the only log path (infra-level, not app-level).

## Foundations

### F-01: Training-plan data foundation

- **Outcome:** (foundation) Minimal Supabase schema for training plans and exercises, with the RLS (row-level security) policy pattern established — free-text exercise entry per PRD's accepted risk (no shared exercise library for v1).
- **Change ID:** training-plan-data-foundation
- **PRD refs:** FR-002, FR-003
- **Unlocks:** S-01 (and establishes the RLS pattern every later slice's own tables — workout logs, goals, calories, measurements — will replicate).
- **Prerequisites:** — (Supabase project already provisioned; auth baseline confirms connectivity)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The table shape and RLS policy chosen here become the template for five more domain tables — getting the policy shape right once here avoids rework across every later slice.
- **Status:** done

## Slices

### S-01: User creates and manages a training plan

- **Outcome:** User can create a training plan and view, edit, and delete exercises in it.
- **Change ID:** create-and-manage-training-plan
- **PRD refs:** FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Free-text exercise entry (no shared library) risks typos/duplicate names — PRD accepts this risk explicitly for v1; do not over-build validation here given the `speed` goal.
- **Status:** done

### S-02: User logs a workout session against their plan

- **Outcome:** User can log a workout session (exercise, weight, reps) against their existing plan, visible only in their own log history.
- **Change ID:** log-workout-against-plan
- **PRD refs:** US-01, FR-001, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — the whole "unified tracking" pitch hinges on this flow feeling seamless against the user's own plan, not a generic log.
- **Status:** done

### S-03: User sets and edits a body-composition goal

- **Outcome:** User can set and edit a body-composition goal (lose/gain/maintain weight) at any time.
- **Change ID:** set-body-composition-goal
- **PRD refs:** FR-004
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — self-contained entity with no dependency on other domain data; main risk is scope creep beyond "set and edit," which the `speed` goal argues against.
- **Status:** done

### S-04: User logs daily calories

- **Outcome:** User can log calories consumed for a given day.
- **Change ID:** log-daily-calories
- **PRD refs:** FR-006
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — smallest, most self-contained slice in the roadmap; safe to build in parallel with anything else.
- **Status:** done

### S-05: User logs weekly body measurements

- **Outcome:** User can log body measurements on a weekly cadence.
- **Change ID:** log-weekly-measurements
- **PRD refs:** FR-007
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — self-contained; only sequencing concern is that it must exist before S-06 can show a measurement delta.
- **Status:** ready

### S-06: User views a weekly progress report

- **Outcome:** User can view a weekly report showing training volume change vs. the prior week, body measurement deltas vs. the prior week, and calorie intake compared against their stated goal.
- **Change ID:** weekly-progress-report
- **PRD refs:** FR-008
- **Prerequisites:** S-02, S-03, S-04, S-05, and one full prior week of logged data (external state — the report is only meaningful once a user has logged a complete prior week to compare against, per PRD's Business Logic section)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Deliberately sequenced last — it depends on real data existing across four independent logging slices; shipping it earlier would only show empty states and prove nothing.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                        | GitHub Issue                                                  | Ready for `/10x-plan` | Notes                                   |
| ---------- | ---------------------------------- | ---------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| F-01       | training-plan-data-foundation      | [#8](https://github.com/Julka768/10xdevs/issues/8)   | done                   | Implemented; issue closed                  |
| S-01       | create-and-manage-training-plan    | [#9](https://github.com/Julka768/10xdevs/issues/9)   | done                   | Implemented; issue closed                  |
| S-02       | log-workout-against-plan           | [#10](https://github.com/Julka768/10xdevs/issues/10) | done                   | Implemented; issue closed                  |
| S-03       | set-body-composition-goal          | [#11](https://github.com/Julka768/10xdevs/issues/11) | done                   | Implemented; issue closed                  |
| S-04       | log-daily-calories                 | [#12](https://github.com/Julka768/10xdevs/issues/12) | done                   | Implemented; issue closed                  |
| S-05       | log-weekly-measurements            | [#13](https://github.com/Julka768/10xdevs/issues/13) | yes                    | Run `/10x-plan log-weekly-measurements`    |
| S-06       | weekly-progress-report             | [#14](https://github.com/Julka768/10xdevs/issues/14) | no                     | Waiting on S-02/S-03/S-04/S-05 (#10-13)    |

Migrated to GitHub Issues on `Julka768/10xdevs`, milestone [`MVP roadmap`](https://github.com/Julka768/10xdevs/milestone/1), on 2026-07-02.

## Open Roadmap Questions

None — PRD's `## Open Questions` is empty, and no new cross-cutting question surfaced during roadmap sequencing.

## Parked

- **AI-driven intensity coaching** — Why parked: PRD Non-Goals — post-MVP; v1 proves unified tracking first.
- **AI-written report narrative** — Why parked: PRD Non-Goals — FR-008 is computed comparisons only.
- **Custom/advanced training-recommendation algorithm** — Why parked: PRD Non-Goals — out of scope beyond FR-008's week-over-week comparison.
- **Data import from other fitness/nutrition apps** — Why parked: PRD Non-Goals — all entry is manual for v1.
- **Sharing training plans or logs between users** — Why parked: PRD Non-Goals — everything stays private to the account.
- **Integrations with wearables/third-party APIs** — Why parked: PRD Non-Goals.
- **Native mobile app** — Why parked: PRD Non-Goals — web only for v1.
- **Live human-trainer visibility/management feature** — Why parked: PRD Non-Goals.
- **Target weight per exercise** — Why parked: deferred from S-01 during implementation (2026-07-03) to keep that slice matching its approved plan (`name`/`target_sets`/`target_reps` only, per FR-002/FR-003). Would need a new `exercises.target_weight` column + migration, zod schema update, and form changes in `/dashboard/plans/[id]`. Revisit as a small follow-up slice, or consider folding into S-02 if the intent is logging *actual* weight performed rather than a planned target.

## Done

- **F-01: (foundation) Supabase schema + RLS pattern for plans/exercises** — Implemented 2026-07-03 in `context/changes/training-plan-data-foundation/` (not yet archived). Lesson: pair RLS with explicit GRANTs (see `context/foundation/lessons.md`).
- **S-01: User creates and manages a training plan** — Implemented 2026-07-03 in `context/changes/create-and-manage-training-plan/` (3 phases: foundation, plans, exercises; not yet archived). Target weight per exercise was deferred — see Parked.
- **S-02: User logs a workout session against their plan** — Implemented 2026-07-03 in `context/changes/log-workout-against-plan/` (3 phases: data foundation, API routes, UI; impl-reviewed, not yet archived). Nullable `exercise_id` + snapshotted `exercise_name` preserves log history across exercise deletion.
- **S-03: User sets and edits a body-composition goal** — Implemented 2026-07-04 in `context/changes/set-body-composition-goal/` (3 phases: data foundation, API route, UI; impl-reviewed, not yet archived). Append-only history table with GRANT-enforced no-update/delete; "current goal" is always the latest row per user.
- **S-04: User logs daily calories** — Implemented 2026-08-21 in `context/changes/log-daily-calories/` (3 phases: data foundation, API routes, UI; impl-reviewed APPROVED, PR merged to master, not yet archived). `logged_at <= current_date` CHECK ships in the initial migration by design, closing the workout_logs PostgREST-bypass gap from day one.

