# Quality-Gates Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates-wiring/plan.md`
> Research: `context/changes/testing-quality-gates-wiring/research.md`

## What & Why

Require the existing unit (23 tests) and integration (15 tests) suites in CI, alongside the existing lint+build gate, so a regression merges to `master` visibly instead of silently. This is test-plan rollout Phase 4 — the final phase, locking in the floor for everything the prior three phases wrote tests for.

## Starting Point

`.github/workflows/ci.yml` has two jobs: `ci` (lint + build) and `deploy` (`needs: ci`, pushes migrations + deploys on push to `master`). Neither runs `npm run test:unit` or `npm run test:integration` today — both suites pass locally but aren't required by CI.

## Desired End State

Every PR shows three checks: `ci` (lint, build, unit tests), `integration-tests` (real local Supabase + integration suite), running in parallel. `deploy` waits on both before shipping to production.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Job structure | Separate `integration-tests` job; unit tests folded into existing `ci` | Docker boot (~2-3 min) shouldn't gate fast lint/build feedback; infra flakes shouldn't mask real lint failures | Plan |
| Deploy gate | `deploy` needs `[ci, integration-tests]`, not just `ci` | The whole point of this phase is blocking regressions from reaching prod, not just reporting them | Plan |
| Branch protection | Skipped for now | `gh api` confirmed 403 — private repo on GitHub's free plan doesn't support required status checks (classic or rulesets) until upgraded/made public | Research + Plan |
| Service exclusion | `-x studio -x edge-runtime -x logflare -x vector -x imgproxy` | Tests only touch Postgres/GoTrue/PostgREST/Kong; trims unnecessary container startup | Research |
| Env synthesis | `supabase status -o env --override-name ...` → `.env.test`, then derive `.env` from it | Verified live against this repo's instance: one CLI call can't map a source key to two destination names, so `.env` is derived in a second trivial step, not a second CLI call | Plan |
| Docker caching | Not attempted | Documented dead end per Supabase's own maintainers — costs roughly the same as a fresh pull | Research |

## Scope

**In scope:** `.github/workflows/ci.yml` changes only — unit-test step, new `integration-tests` job, `deploy`'s `needs` update.

**Out of scope:** GitHub branch protection/required checks (plan-blocked), Docker image caching, any change to test files themselves, `supabase stop` teardown, the `deploy` job's existing remote `db push` step.

## Architecture / Approach

Three parallel-capable jobs in one workflow file: `ci` (fast, no infra), `integration-tests` (Docker-bound, ~2-4 min, boots a local Supabase stack via `supabase/setup-cli@v3` + `supabase start`), `deploy` (gated on both). No new files, no application code changes — pure CI/CD wiring.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Unit tests in `ci` | Trivial one-line addition, zero infra | None — already verified locally, no new dependencies |
| 2. `integration-tests` job + deploy gate | Full local-Supabase-in-CI wiring, deploy gating | First real GitHub Actions run of `supabase start` in this repo — verified locally and via research, but the actual CI run is the first live proof |

**Prerequisites:** None — self-contained, no dependency on other in-flight work.
**Estimated effort:** Small — one session, two phases.

## Open Risks & Assumptions

- Required status checks can't be enforced today (GitHub plan limitation) — the gate is currently advisory (visible red/green) rather than merge-blocking until the user upgrades the plan or makes the repo public.
- `supabase start`'s cold-start timing in this repo's actual CI environment is a research-sourced estimate (~2-3 min), not yet measured directly in this repo's own Actions runner — Phase 2's manual verification confirms the real number.

## Success Criteria (Summary)

- Every PR shows unit and integration test results as part of CI, not just lint/build.
- A red unit or integration test is clearly visible on the PR before merge.
- `deploy` never ships code past a failing integration suite.
