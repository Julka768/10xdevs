---
date: 2026-08-30T13:35:00Z
researcher: Claude Sonnet 5
git_commit: f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c
branch: master
repository: Julka768/10xdevs
topic: "Wiring unit + integration test suites into GitHub Actions CI (test-plan rollout Phase 4)"
tags: [research, codebase, ci, github-actions, supabase, testing]
status: complete
last_updated: 2026-08-30
last_updated_by: Claude Sonnet 5
---

# Research: Wiring unit + integration test suites into GitHub Actions CI

**Date**: 2026-08-30T13:35:00Z
**Researcher**: Claude Sonnet 5
**Git Commit**: f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c
**Branch**: master
**Repository**: Julka768/10xdevs

## Research Question

Test-plan rollout Phase 3 (context/foundation/test-plan.md §3, Phase 4 "Quality-gates wiring"): require the existing unit and integration test suites in CI alongside the existing lint+build gate. The concrete unknown to ground before planning: does GitHub Actions support spinning up the Supabase CLI/Docker stack (needed for integration tests) inside a CI job, or does it need a different strategy — and what does this repo's own test harness actually require to run?

## Summary

Yes — running the local Supabase stack (`supabase start`) in GitHub Actions CI is a reasonable, officially documented, supported pattern on `ubuntu-latest` runners (Docker preinstalled, plenty of RAM). It adds roughly **2-3 minutes of cold-start wall-clock** (Docker image caching is a documented dead end per Supabase's own maintainers — don't build a caching step). The unit suite has zero infrastructure needs and can be added to the existing `ci` job immediately at no cost. The integration suite needs real plumbing this repo doesn't have today: **two separate env files with different variable names** (`.env` for the app's own dev server the harness spawns; `.env.test` for the harness's direct Supabase Admin/anon calls), currently populated by hand from `supabase start`'s printed output — nothing in the repo automates this, so the CI workflow must synthesize both files itself (e.g. from `supabase status -o env`). Recommended shape: **a separate `integration-tests` job**, not folded into the existing `ci` job, so a slow Docker boot doesn't gate the fast lint/build feedback loop, and an infra flake doesn't block a legitimate lint failure from reporting quickly.

## Detailed Findings

### What `ci.yml` does today

- `ci` job: checkout → setup-node (Node 22) → `npm ci` → `npx astro sync` → `npm run lint` → `npm run build` (with `SUPABASE_URL`/`SUPABASE_KEY` secrets) — [.github/workflows/ci.yml:9-24](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/.github/workflows/ci.yml#L9-L24)
- `deploy` job (needs `ci`, only on push to `master`): checkout → setup-node → `npm ci` → `npm run build` → **`npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`** → `cloudflare/wrangler-action@v3` deploy — [.github/workflows/ci.yml:26-56](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/.github/workflows/ci.yml#L26-L56)
- Neither job runs `npm run test:unit` or `npm run test:integration` today. Both suites exist and pass locally but a regression in either currently merges to `master` undetected.
- The `deploy` job already proves the `npx supabase ...` pattern works fine in this exact CI (it pushes migrations to the *remote* project via `--db-url`); this phase needs the CLI's *local* stack (`supabase start`) instead, a different code path of the same CLI already present as an `npm` devDependency.

### Unit suite — zero new infrastructure needed

- `npm run test:unit` = `vitest run tests/unit` — [package.json:14](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/package.json#L14). 23 tests (`tests/unit/date-utils.test.ts`, `tests/unit/weekly-report.test.ts`), no Supabase/network dependency — pure functions against fixture data. This can be added to the existing `ci` job as a plain extra `run:` step with no new secrets, services, or jobs.

### Integration suite — real plumbing gap

- `npm run test:integration` = `vitest run tests/integration` — [package.json:15](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/package.json#L15). Both `test:unit` and `test:integration` load the same `vitest.config.ts`, which pulls `.env.test` into `test.env` via Vite's `loadEnv("test", ...)` — [vitest.config.ts:1-17](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/vitest.config.ts#L1-L17).
- **Two separate env files, two separate variable-naming conventions, both required simultaneously:**
  1. `.env` (app runtime — what the harness's spawned `astro dev` child process reads): `SUPABASE_URL`, `SUPABASE_KEY` — [.env.example:1-2](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/.env.example#L1-L2)
  2. `.env.test` (test harness's own direct calls): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — [.env.test.example:1-5](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/.env.test.example#L1-L5)
  - **Nothing in the repo automates populating either file today** — the comment literally says "fill in with the values `supabase start` prints locally," i.e. it's a manual copy-paste step for local dev. CI must synthesize both files itself; there is no existing script to reuse or extend.
- `tests/integration/support/fixture-users.ts` uses the **service-role key** to create/delete fixture users via the Supabase Admin API (`admin.auth.admin.createUser`/`deleteUser`) — [tests/integration/support/fixture-users.ts:33-39,51-55,73-78](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/tests/integration/support/fixture-users.ts#L33-L39). It has a **hard-coded safety guard** refusing to run unless `SUPABASE_URL`'s hostname is `localhost`/`127.0.0.1` — [fixture-users.ts:20-31](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/tests/integration/support/fixture-users.ts#L20-L31). A CI-local `supabase start` naturally satisfies this (its API URL is `http://127.0.0.1:54321`), so no code change is needed there — just make sure CI never accidentally points `SUPABASE_URL` at a remote project.
- `tests/integration/support/dev-server.ts` spawns `npm run dev -- --port 4399` itself and polls `http://localhost:4399` for up to 30s — [dev-server.ts:3-5,44-51](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/tests/integration/support/dev-server.ts#L3-L51). Only `tests/integration/routes/plans-authorization.test.ts` calls `startDevServer()` (in `beforeAll`, 60s Vitest hook timeout) — the four `tests/integration/rls/*.test.ts` files (cascade-behavior, exercises, training-plans, workout-logs) exercise Postgres/RLS and the Admin API directly, not the dev server, so they likely don't need `.env` (app) populated at all, only `.env.test`. Worth a quick confirm during planning (grep those four files for `startDevServer` usage) rather than assuming, but low-risk either way since providing both files is cheap.
- `supabase` is already an `npm` devDependency (`"supabase": "^2.109.0"` — [package.json:57](https://github.com/Julka768/10xdevs/blob/f4dbe11bc7a8b3aed931bb1b5e346c86c27cf26c/package.json#L57)), already used via `npx supabase` in the `deploy` job. The official `supabase/setup-cli` GitHub Action is an alternative that installs a pinned CLI binary directly (avoiding any npm-cache staleness) but isn't required — `npx supabase` (already proven working in this exact workflow) is a valid, simpler choice that adds no new Action dependency.

### `supabase start` in GitHub Actions — verified externally

- Official, documented pattern: Supabase's own docs page "Automated testing using GitHub Actions" (https://supabase.com/docs/guides/deployment/ci/testing) demonstrates `supabase/setup-cli` → `supabase start` → run tests against the local stack.
- `ubuntu-latest` runners have Docker preinstalled with no extra setup; Supabase recommends ≥7GB RAM to start all services, comfortably under the runner's 16GB.
- **Cold-start cost: ~2-3 minutes**, confirmed across multiple sources. **Docker layer/image caching does not help** — Supabase's own maintainers concluded (in a caching feature-request discussion) that caching cost roughly the same as a fresh pull, since GitHub-hosted runners can't persist a pre-populated disk between runs. Don't build a caching step; it's a documented dead end.
- The one **effective** speedup: run `supabase start` as an **early background step in parallel** with other CI setup (not caching), and/or trim it with `-x`/`--exclude` to skip services this repo's tests don't touch: `-x studio -x edge-runtime -x logflare -x vector -x imgproxy` (this repo's `supabase/config.toml` has `[studio]`, `[edge_runtime]`, `[analytics]` (Logflare/Vector-backed), and storage-image-transform-adjacent blocks enabled, none of which the RLS/route-authorization tests exercise — only Postgres, GoTrue, PostgREST, and Kong are actually needed).
- `db.migrations.enabled = true` in `supabase/config.toml` means `supabase start` applies every file in `supabase/migrations/*.sql` automatically on boot — no separate "run migrations" CI step needed (this now includes the Phase 3 migration widening the `logged_at` grace-window CHECK constraints, so CI would exercise that too).
- `supabase status -o env` (with `--override-name` to remap keys, e.g. `api.url`→`SUPABASE_URL`, `auth.service_role_key`→`SUPABASE_SERVICE_ROLE_KEY`) is the CLI-sanctioned way to export the running local instance's endpoints/keys into the CI environment — this is the mechanism to actually solve the "two env files, different names" gap identified above, run twice (or once with careful mapping) to produce both `.env` and `.env.test` shapes.

## Code References

- `.github/workflows/ci.yml:9-24` — existing `ci` job (lint + build only)
- `.github/workflows/ci.yml:26-56` — existing `deploy` job, already proves `npx supabase ...` works in this CI (remote `db push`, not local `start`)
- `package.json:14-15` — `test:unit` / `test:integration` script definitions
- `package.json:57` — `supabase` devDependency version already pinned
- `vitest.config.ts:1-17` — both suites share config, both load `.env.test`
- `.env.example:1-2` / `.env.test.example:1-5` — the two required env shapes, currently manual
- `tests/integration/support/fixture-users.ts:20-31` — hard local-only safety guard (satisfied automatically by a CI-local `supabase start`)
- `tests/integration/support/dev-server.ts:3-51` — spawns `astro dev` itself, hardcoded port 4399, 30s ready timeout
- `supabase/config.toml:357-386` — `[edge_runtime]`, `[analytics]` blocks safe to exclude via `-x` in CI

## Architecture Insights

- This repo already has one working precedent for using the Supabase CLI non-interactively in CI (`deploy` job's `db push`) — the new integration-tests job is a variation on an already-proven pattern, not a first-of-its-kind risk.
- The "two env files, two naming conventions" split is a pre-existing local-dev-only wrinkle (documented via comments, not code) that CI wiring forces into the open — this is exactly the kind of finding this phase exists to surface, per `context/foundation/test-plan.md` §1 principle #3 ("research is the ground truth" when it disagrees with the plan's assumptions).
- Splitting lint/build (fast, seconds) from integration tests (Docker-bound, minutes) into separate parallel jobs matches this repo's existing job-splitting instinct (`ci` vs `deploy` are already separate jobs with a `needs:` dependency) — a natural third job fits the existing shape rather than requiring a new pattern.

## Historical Context (from prior changes)

- `context/changes/testing-critical-path-integrity/plan.md:33` — explicit prior scope note: "Not wiring these tests into CI — that's rollout Phase 4 ('Quality-gates wiring')... This phase only makes the suite runnable locally." Confirms this phase is the first to touch CI test-wiring; no prior partial attempt exists to reconcile.
- `context/foundation/tech-stack.md:9,24` and `context/foundation/infrastructure.md:104-109` — neither foundation doc addresses running tests in CI or Supabase-in-CI; `infrastructure.md` explicitly scoped "CI/CD pipeline setup" and "Docker image configuration" as out-of-scope for its own research. This is genuinely new ground, not a rediscovery of an existing decision.

## Related Research

- `context/changes/testing-date-timezone-boundary-hardening/plan.md` — most recent prior rollout phase; same repo conventions (plain `.refine()`/migration style) but no CI content.
- `context/changes/testing-critical-path-integrity/research.md` (if present) — original bootstrap of the integration fixture harness this phase now has to run in CI.

## Open Questions

- Should the four `tests/integration/rls/*.test.ts` files be confirmed (not just presumed) to not call `startDevServer()`, to decide whether `.env` (app) is strictly required for the full integration job or only for `plans-authorization.test.ts`? Low-cost to just provide both regardless.
- Exact `-x` service list to exclude is a planning-time tuning decision, not a blocker — starting conservative (exclude only `studio`, `edge-runtime`, `logflare`, `vector`, `imgproxy`) and trimming further later is safe.
- Whether to also add the integration-tests job as a required status check in GitHub branch protection (not currently configured per anything found in this research) is a repo-settings decision outside this phase's code/workflow scope — worth surfacing to the user during planning, not deciding unilaterally.
