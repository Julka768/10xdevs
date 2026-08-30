# Quality-Gates Wiring Implementation Plan

## Overview

Require the existing unit and integration test suites in CI, alongside the existing lint+build gate, so a regression in either suite is visible on every PR instead of merging to `master` undetected. This is test-plan rollout Phase 4 (`context/foundation/test-plan.md` §3), the final phase — it locks in the floor for every risk the prior three phases already wrote tests for.

## Current State Analysis

`.github/workflows/ci.yml` has two jobs today:
- `ci` (runs on push/PR to `master`): checkout → setup-node → `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`.
- `deploy` (`needs: ci`, only on push to `master`): checkout → setup-node → `npm ci` → `npm run build` → `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes` → `cloudflare/wrangler-action@v3` deploy.

Neither job runs `npm run test:unit` (23 tests, `tests/unit/`) or `npm run test:integration` (15 tests, `tests/integration/`). Both pass locally today.

## Desired End State

- `ci` job also runs `npm run test:unit` — fails the job (and blocks the PR from looking green) on any unit-test regression.
- A new `integration-tests` job spins up a local Supabase stack via the CLI, synthesizes the two env files the test harness needs, and runs `npm run test:integration` — fails the job on any integration regression.
- `deploy` waits on both `ci` and `integration-tests` (`needs: [ci, integration-tests]`) — a red test suite blocks the production deploy, not just the PR's green checkmark.
- Verified locally that this repo's exact `supabase status -o env --override-name ...` invocation produces the right variable names for both env files (see Key Discoveries).

### Key Discoveries:

- **Two separate env files, two separate naming conventions, both required** — the app's own dev server (spawned by the test harness) reads `.env`'s `SUPABASE_URL`/`SUPABASE_KEY`; the harness itself reads `.env.test`'s `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` directly (`tests/integration/support/fixture-users.ts:5-7`, `.env.example:1-2`, `.env.test.example:1-5`). Nothing in the repo automates populating either today — CI must synthesize both itself.
- **Verified exact `--override-name` source paths** (confirmed live against this repo's running local instance — the paths are *not* the flat `ANON_KEY`/`SERVICE_ROLE_KEY` output names, and *not* bare `anon_key`/`service_role_key`): `api.url`, `auth.anon_key`, `auth.service_role_key`. One invocation can't map the same source key to two different destination names (last `--override-name` for a given source wins) — so `.env.test` is generated directly from `supabase status -o env`, and `.env` is derived from it in a second, trivial step (copy `SUPABASE_URL`, reuse `SUPABASE_ANON_KEY`'s value as `SUPABASE_KEY`) rather than a second CLI invocation.
- **`tests/integration/support/fixture-users.ts:20-31`** hard-refuses to run unless `SUPABASE_URL`'s hostname is `localhost`/`127.0.0.1` — a CI-local `supabase start` satisfies this automatically (its API URL is always `http://127.0.0.1:54321`); no code change needed, just don't ever point CI's `SUPABASE_URL` at a remote project.
- **`supabase/config.toml`'s `db.migrations.enabled = true`** means `supabase start` applies every file in `supabase/migrations/*.sql` on boot automatically — no separate migration step needed in the new job.
- **`supabase/setup-cli@v3`** is the current stable major tag (latest release `v3.0.0`, verified directly against the GitHub API) — installs a pinned CLI binary, avoiding any `npm`-cache staleness from the `supabase` devDependency.
- **Branch protection / required status checks are unavailable on this plan** — `gh api repos/Julka768/10xdevs/branches/master/protection` and `.../rulesets` both return 403 ("Upgrade to GitHub Pro or make this repository public"). This repo is private on GitHub's free plan, and both classic branch protection and the newer rulesets API are Pro-gated for private repos. The new jobs will report red/green on every PR, but nothing technically blocks a merge past a red check until the user upgrades the plan or makes the repo public — confirmed with the user as an accepted, temporary limitation for this phase.

## What We're NOT Doing

- Not configuring GitHub branch protection / required status checks — blocked by the repo's current GitHub plan (see Key Discoveries). The jobs report status; enforcement is a follow-up once the plan allows it.
- Not adding Docker image caching for the Supabase stack — documented dead end per Supabase's own maintainers (research.md, "Cold-start cost" finding); would add complexity for no measured benefit.
- Not changing `tests/integration/support/*.ts` or any test file — the harness already works correctly against a local Supabase instance; this phase only wires CI to provide one.
- Not adding a `supabase stop` teardown step — the GitHub Actions runner is destroyed after the job; teardown only matters for reused self-hosted runners, which this repo doesn't use.
- Not touching the `deploy` job's existing `npx supabase db push` step (remote migration push) — that's a different, already-working code path of the same CLI; this phase only adds the *local* `supabase start` path for a different job.

## Phase 1: Unit tests in the existing `ci` job

### Overview

Add `npm run test:unit` as a step in the existing `ci` job. Zero new infrastructure, zero new secrets — the unit suite is pure functions against fixture data.

### Changes Required:

#### 1. Add unit-test step to `ci` job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the unit suite on every push/PR to `master`, failing the job (and the PR check) on any regression. Placed after `npm run lint` and before `npm run build` so a cheap, fast check fails before the slower build step runs.

**Contract**: New step `- run: npm run test:unit` in the `ci` job's `steps:` list, between the existing `lint` and `build` steps. No new `env:` needed.

### Success Criteria:

#### Automated Verification:

- [ ] `ci` job runs `npm run test:unit` and it passes on the current codebase (23/23)
- [ ] Existing `npm run lint` and `npm run build` steps still pass unchanged

#### Manual Verification:

- [ ] Open the Actions tab for a test push/PR and confirm the new step appears and shows green in the `ci` job's log

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Integration-tests job + deploy gate

### Overview

Add a new `integration-tests` job that boots a local Supabase stack, synthesizes the two env files the test harness needs, and runs the integration suite. Update `deploy` to also wait on this job.

### Changes Required:

#### 1. New `integration-tests` job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the integration suite (15 tests: 4 RLS files + 1 route-authorization file) against a real, ephemeral local Supabase instance on every push/PR to `master`, in parallel with the existing `ci` job rather than inside it — so a slow Docker boot (~2-3 min) never delays the fast lint/build feedback, and an infra flake in this job doesn't mask a real lint/build failure reporting separately.

**Contract**: New top-level job `integration-tests` (sibling of `ci` and `deploy`, `runs-on: ubuntu-latest`), steps:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node-version 22, cache npm) — matches the `ci` job exactly
3. `npm ci`
4. `supabase/setup-cli@v3` (installs the pinned CLI binary)
5. `supabase start -x studio -x edge-runtime -x logflare -x vector -x imgproxy` — the excluded services aren't exercised by this repo's tests (only Postgres, GoTrue, PostgREST, and Kong are needed); migrations apply automatically on boot per `db.migrations.enabled = true`
6. A step that runs the verified `supabase status -o env --override-name api.url=SUPABASE_URL --override-name auth.anon_key=SUPABASE_ANON_KEY --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY` command, redirects its output to `.env.test`, then derives `.env` from it (copy the `SUPABASE_URL` line; write a `SUPABASE_KEY` line reusing the `SUPABASE_ANON_KEY` value) — see Key Discoveries for why one CLI call can't produce both files directly.
7. `npm run test:integration`

No GitHub secrets are needed for this job — the local Supabase instance uses the CLI's fixed local demo keys, not any project-specific credential.

#### 2. Gate `deploy` on integration tests too

**File**: `.github/workflows/ci.yml`

**Intent**: A production deploy should not go out if the integration suite (RLS/authorization/cascade coverage) is red — today `deploy` only waits on `ci` (lint+build).

**Contract**: Change `deploy`'s `needs: ci` to `needs: [ci, integration-tests]`. No other change to the `deploy` job.

### Success Criteria:

#### Automated Verification:

- [ ] `integration-tests` job's `supabase start` step reaches healthy state and `npm run test:integration` runs (15/15) against it in an actual GitHub Actions run
- [ ] The synthesized `.env`/`.env.test` files contain the expected `SUPABASE_URL`/`SUPABASE_KEY` and `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` values respectively (visible in the job log or via a debug `cat` during first verification, then removed)
- [ ] `deploy` job's YAML shows `needs: [ci, integration-tests]`
- [ ] A push to `master` (merge of this PR) triggers `deploy` only after both `ci` and `integration-tests` report success

#### Manual Verification:

- [ ] Open the Actions tab for the PR that lands this change and confirm `integration-tests` appears as a separate job, runs in parallel with `ci`, and goes green
- [ ] Confirm total added wall-clock for `integration-tests` is in the expected ~2-4 min range (Docker boot + test run), not dramatically higher

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- N/A — this phase's own testing is the CI workflow itself; no new application unit tests are added.

### Integration Tests:

- N/A — same; this phase wires up execution of the *existing* suites, it doesn't add new test cases.

### Manual Testing Steps:

1. Push this change as a PR and watch the Actions tab: confirm `ci` (with the new unit-test step) and `integration-tests` both appear and run in parallel.
2. Confirm `integration-tests` reaches a green `npm run test:integration` result (15/15) in the Actions log.
3. Merge the PR and confirm `deploy` only starts after both `ci` and `integration-tests` show green (visible in the workflow run's job graph).
4. As a negative check (optional but recommended once, not part of every future PR): temporarily break one unit test and one integration test locally, push to a throwaway branch/PR, confirm both `ci` and `integration-tests` go red and clearly show which test failed in the log, then revert.

## Migration Notes

None — no schema or data changes; this phase only touches `.github/workflows/ci.yml`.

## References

- Related research: `context/changes/testing-quality-gates-wiring/research.md`
- Test-plan rollout phase: `context/foundation/test-plan.md` §3 Phase 4 ("Quality-gates wiring")
- Prior scope note: `context/changes/testing-critical-path-integrity/plan.md:33` ("Not wiring these tests into CI — that's rollout Phase 4")
- Official pattern reference: https://supabase.com/docs/guides/deployment/ci/testing
- Action reference: https://github.com/supabase/setup-cli

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Unit tests in the existing `ci` job

#### Automated

- [x] 1.1 `ci` job runs `npm run test:unit` and it passes (23/23) — 57c6cfa
- [x] 1.2 Existing `lint`/`build` steps still pass unchanged — 57c6cfa

#### Manual

- [x] 1.3 New step visible and green in Actions log for a test push/PR — verified in PR #30, run 33310069669

### Phase 2: Integration-tests job + deploy gate

#### Automated

- [ ] 2.1 `integration-tests` job's `supabase start` reaches healthy, `npm run test:integration` passes (15/15) in an actual GitHub Actions run
- [ ] 2.2 Synthesized `.env`/`.env.test` contain expected variable names/values
- [x] 2.3 `deploy` job's YAML shows `needs: [ci, integration-tests]`
- [ ] 2.4 A push to `master` triggers `deploy` only after both `ci` and `integration-tests` succeed

#### Manual

- [ ] 2.5 `integration-tests` appears as a separate parallel job and goes green in the Actions tab
- [ ] 2.6 Added wall-clock is in the expected ~2-4 min range
