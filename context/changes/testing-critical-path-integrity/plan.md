# Critical-Path Integrity & Authorization Tests — Implementation Plan

## Overview

Bootstrap this project's first test runner (Vitest, plain Node environment) and a two-seeded-user Supabase fixture harness, then use it to lock in ownership/RLS/GRANT correctness (Risk #1), cross-account write attribution (Risk #2), API-route authorization/IDOR (Risk #3), and `ON DELETE` cascade correctness (Risk #4) across the three tables that exist today: `training_plans`, `exercises`, `workout_logs`. This is rollout Phase 1 of `context/foundation/test-plan.md`.

## Current State Analysis

- No test runner, no test config, no test files exist anywhere in the repo — confirmed via `package.json` (no vitest/jest/playwright in dependencies, no `test` script) and a root-level config glob.
- Four migrations exist under `supabase/migrations/`:
  - `20260703121505_create_training_plan_schema.sql` — `training_plans` + `exercises`, per-operation RLS, explicit GRANTs, both FKs `ON DELETE CASCADE`.
  - `20260703140000_harden_exercises_plan_ownership_rls.sql` — replaces the original `exercises_insert_own`/`exercises_update_own` policies, which checked `user_id` but not that `plan_id` belonged to that same user. This fixed a real bug (plan_id squatting), not a hypothetical one.
  - `20260703161941_create_workout_logs_schema.sql` — `workout_logs`, three-way ownership check on insert (self + plan + exercise-belongs-to-plan), `exercise_id` is the one `ON DELETE SET NULL` FK in the schema, and the UPDATE grant is column-scoped to `weight, reps, sets_completed, logged_at` only (`plan_id`/`exercise_id`/`user_id`/`exercise_name` are not grantable for UPDATE at all, regardless of RLS).
  - `20260703170111_add_workout_logs_logged_at_not_future_check.sql` — adds a DB-level CHECK for the future-date rule, closing a gap where it was previously zod-only (app-level).
- Every Supabase client in the app (`src/lib/supabase.ts`, used identically by all 9 `/api/plans/**` routes) uses the anon key + cookie session only — no service-role key exists anywhere in the codebase or `README.md` today.
- Several mutation routes (`plans/[id]/delete.ts`, `plans/[id]/rename.ts`, both `exercises/[exerciseId]/*` routes, both `logs/[logId]/*` routes) filter only by the target row's own id and rely entirely on RLS for ownership — no `.eq("user_id", ...)` defense-in-depth. Their correctness is a pure function of RLS being right.
- `context.locals.user` is populated only by `src/middleware.ts`'s own Supabase client + `getUser()` call, before any route runs; routes never construct `locals` themselves and always fetch a fresh, independent Supabase client via `createClient(context.request.headers, context.cookies)`.
- Supabase's `.update()`/`.delete()` on RLS-excluded rows returns success with 0 affected rows, not an error — every existing route already checks `data.length === 0` post-mutation (established pattern from the `create-and-manage-training-plan` and `log-workout-against-plan` plans).
- `supabase/config.toml` references `./seed.sql` for DB seeding but no such file exists yet — irrelevant to this plan (fixtures are created via the admin API at test time, not via seed SQL).
- Supabase CLI is pinned at `2.109.0` (`package.json` + lockfile).
- `README.md:114` states "No database tables or migrations are required" — stale, since 4 migrations now exist. This plan corrects it as a small drive-by fix, since the harness this phase adds depends on `supabase db reset` actually being run by whoever sets up the local environment.

### Key Discoveries:

- `20260703140000_harden_exercises_plan_ownership_rls.sql` (comment lines 1-6) documents the exact historical bug shape — this is direct regression-test material, not a speculative risk.
- `workout_logs`'s UPDATE grant is column-scoped — a distinct enforcement layer from RLS, worth testing directly rather than assuming the app's own field omission is what protects it.
- Routes never share a Supabase client with the middleware; each handler independently reconstructs one from `context.request.headers`/`context.cookies`. Route-level tests must exercise real HTTP with real cookies, not an in-process client swap — a hand-built `APIContext` mock would risk missing exactly the routing/middleware-boundary concern IDOR tests exist to catch.
- Mocking Supabase for any of these tests would defeat their purpose: RLS/GRANT enforcement is the thing under test.

## What We're NOT Doing

- Not testing `goals`/`calories`/`measurements` tables — they don't exist yet (roadmap S-03/S-04/S-05 not built). The fixture harness is designed for reuse when those land (see `context/foundation/test-plan.md` §6.1/§6.2), but no placeholder/skeleton tests are written against nonexistent schema.
- Not wiring these tests into CI — that's rollout Phase 4 ("Quality-gates wiring") in `context/foundation/test-plan.md`. This phase only makes the suite runnable locally.
- Not adding e2e/browser tests (Playwright, etc.) — the route-authorization tests use plain HTTP requests (`fetch`) against a locally running dev server, not a browser.
- Not testing the weekly report (Risk #5) or date/timezone boundaries (Risk #6) — those are rollout Phases 2 and 3 of the test plan, separate change folders.
- Not adding accessibility or visual-regression tests — out of this rollout's risk map entirely (`test-plan.md` §4).
- Not fixing anything else in `README.md` beyond the one stale migrations line.

## Implementation Approach

Four phases, each building on the last: (1) install Vitest, add a local-only service-role key and the two-user fixture harness, fix the README line; (2) DB-layer ownership/RLS/GRANT tests using the harness directly against `supabase-js`, no HTTP involved; (3) route-layer IDOR tests using the harness plus a real running dev server and real HTTP requests; (4) cascade-behavior tests, DB-layer only. Phases 2-4 all depend on Phase 1's harness; Phases 2 and 4 are DB-only and fast, Phase 3 additionally needs the dev server and is deliberately isolated in its own file so it doesn't slow down the others.

## Critical Implementation Details

### Two-user fixture harness boundary

The service-role key used to create/delete fixture users must live only in a test-scoped env file (`.env.test`, gitignored) and only be read by test setup code — never by `src/lib/supabase.ts` or any app route. The harness's own Supabase client (constructed with the service-role key, used only for `admin.createUser`/`admin.deleteUser`) must be a separate client instance from the per-user clients that actually exercise RLS — those authenticate as each fixture user via their own session (`signInWithPassword`), exactly like a real user would, never via the service-role client.

### Route-layer test lifecycle

Because `context.locals.user` is populated by the Astro middleware from real cookies (not something a test can inject directly), the Phase 3 tests need an actual `astro dev` (or `astro preview`) process running against the local Supabase instance for the duration of that phase's suite — started in a `beforeAll` and torn down in `afterAll`, with a readiness poll (retry the root URL until it responds) rather than a fixed sleep before issuing requests.

## Phase 1: Harness bootstrap — Vitest, fixture users, README fix

### Overview

Install Vitest, add the local-only service-role key, build the two-user create/sign-in/cleanup fixture harness, wire an npm script, and fix the stale README line.

### Changes Required:

#### 1. Vitest install + config

**File**: `package.json`, `vitest.config.ts` (new)

**Intent**: Add Vitest as the project's test runner, plain Node environment — none of the routes under test use Workers-specific bindings (KV/R2/Durable Objects), so a Workers-runtime test pool would add setup cost without covering any risk on the map.

**Contract**: `vitest` added to devDependencies. `vitest.config.ts` sets `test.environment: "node"` and `test.include` to `tests/integration/**/*.test.ts`. `package.json` gets a `"test:integration": "vitest run"` script.

#### 2. Local-only service-role key

**File**: `.env.test.example` (new, committed), `.gitignore`

**Intent**: Give the fixture harness the service-role key `supabase start` already prints locally, scoped to test-only env loading, without touching `.env`/`.dev.vars` or any app code path.

**Contract**: `.env.test.example` documents `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (local values only). `.gitignore` gets `.env.test` added alongside the existing `.dev.vars` ignore entry. The developer copies it to `.env.test` locally with the values `supabase start` prints; this file is never committed.

#### 3. Two-user fixture harness

**File**: `tests/integration/support/fixture-users.ts` (new)

**Intent**: Provide fixture-user creation/cleanup on top of a service-role client kept private to this module, plus per-user authenticated clients for the tests to actually exercise RLS with.

**Contract**: Exports `createFixtureUser(): Promise<{ id: string; email: string; client: SupabaseClient }>` and `deleteFixtureUser(id: string): Promise<void>`. The returned `client` is authenticated as that fixture user (created with a known password via the admin API, then `signInWithPassword`) — never the service-role client. A `withTwoFixtureUsers(fn: (a, b) => Promise<void>)` helper wraps create-both/run/cleanup-both, since every Phase 2-4 test needs exactly two users.

#### 4. README fix

**File**: `README.md`

**Intent**: Correct the stale claim at line 114 that no migrations are required.

**Contract**: Replace the "No database tables or migrations are required" line with a note that `supabase db reset` must be run after `supabase start` to apply the existing migrations before the app (or this integration suite) will work.

### Success Criteria:

#### Automated Verification:

- `npm install` completes with vitest added
- `npm run test:integration` runs (even with zero test files yet) without configuration errors
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Against a locally running `supabase start` + `supabase db reset`, calling `createFixtureUser()` twice and then `deleteFixtureUser()` for both leaves no residual rows in `auth.users`
- The updated README line accurately describes the required `supabase db reset` step

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Ownership / RLS / GRANT integration tests

### Overview

Using the Phase 1 harness, test cross-user rejection plus same-user success for `training_plans`, `exercises`, and `workout_logs`; the plan_id-squatting regression; and the `workout_logs` column-scoped UPDATE grant.

### Changes Required:

#### 1. training_plans ownership tests

**File**: `tests/integration/rls/training-plans.test.ts` (new)

**Intent**: Verify Risk #1/#2 for `training_plans` — user B can never SELECT/UPDATE/DELETE user A's plan, and user A's own CRUD still works.

**Contract**: Using `withTwoFixtureUsers`, seed a plan as user A; assert user B's SELECT returns it as absent, UPDATE/DELETE affect 0 rows, and user A's own SELECT/UPDATE/DELETE succeed.

#### 2. exercises ownership + plan_id-squatting regression tests

**File**: `tests/integration/rls/exercises.test.ts` (new)

**Intent**: Verify Risk #1/#2 for `exercises`, plus the specific historical bug fixed by `20260703140000_harden_exercises_plan_ownership_rls.sql`.

**Contract**: Same cross-user/same-user pattern as `training_plans`, plus one dedicated case: as user B, attempt to insert an exercise with `user_id = B` but `plan_id` pointing at user A's plan — assert rejection. This is the exact shape the hardening migration fixed.

#### 3. workout_logs ownership + GRANT privilege-escalation tests

**File**: `tests/integration/rls/workout-logs.test.ts` (new)

**Intent**: Verify Risk #1/#2 for `workout_logs`, plus the column-scoped GRANT boundary.

**Contract**: Cross-user/same-user CRUD pattern as above (seed a plan + exercise + log as user A first). Additionally: as user A (the row's own owner), attempt `update({ plan_id: <other-plan-id> })` and separately `update({ exercise_id: <other-exercise-id> })` directly via `supabase-js` on their own row — assert both are rejected by the grant. This is distinct from the ownership check, since the row genuinely belongs to the requester; the rejection must come from the column-scoped GRANT, not RLS.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` — all Phase 2 test files pass against a freshly reset local Supabase
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Temporarily reverting `20260703140000_harden_exercises_plan_ownership_rls.sql` locally causes the plan_id-squatting regression test to fail, confirming the test actually detects the historical bug rather than being a schema-introspection tautology; then restore the migration.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: API-route authorization (IDOR) tests

### Overview

Start a real Astro dev server against the local Supabase instance, sign in as two fixture users, and issue real HTTP requests to all applicable `/api/plans/**` mutation routes using the other user's row id.

### Changes Required:

#### 1. Dev-server lifecycle helper

**File**: `tests/integration/support/dev-server.ts` (new)

**Intent**: Start/stop `astro dev` for the duration of the route-authorization suite, with a readiness poll.

**Contract**: Exports `startDevServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }>` — spawns the process, polls the root URL with retries until it responds, returns the base URL and a teardown function. Used in a `beforeAll`/`afterAll` in the route test file only — the DB-only Phase 2/4 suites don't need it.

#### 2. Route authorization tests

**File**: `tests/integration/routes/plans-authorization.test.ts` (new)

**Intent**: Verify Risk #3 across every mutation route that takes a row id — user B's authenticated session hitting user A's row must never mutate it and must never surface a 500.

**Contract**: For each of the 8 id-scoped mutation routes (`plans/[id]/rename`, `plans/[id]/delete`, `exercises/index` [create, scoped to plan id], `exercises/[exerciseId]/update`, `exercises/[exerciseId]/delete`, `exercises/[exerciseId]/logs` [create], `logs/[logId]/update`, `logs/[logId]/delete`), issue a `POST` with user B's session cookie against a row/plan owned by user A, and assert: (a) the row is unchanged when re-read as user A afterward, (b) the HTTP response is a redirect (not a 500/unhandled error), (c) the redirect's `?error=` param, if present, doesn't leak raw DB error text.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` — Phase 3 test file passes against a freshly reset local Supabase and a locally started dev server
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Manually confirm the dev-server helper cleanly terminates the spawned process after the suite runs (no orphaned `astro dev` process left running)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: ON DELETE cascade behavior tests

### Overview

Confirm the cascade/SET NULL behavior across `training_plans` → `exercises`/`workout_logs` and `exercises` → `workout_logs` is exactly as designed.

### Changes Required:

#### 1. Cascade tests

**File**: `tests/integration/rls/cascade-behavior.test.ts` (new)

**Intent**: Verify Risk #4 — deleting a `training_plans` row removes dependent `exercises`/`workout_logs` rows; deleting an `exercises` row leaves its `workout_logs` rows intact with `exercise_id` nulled and `exercise_name` preserved.

**Contract**: Seed a plan with an exercise and a workout log referencing it. Delete the exercise — assert the `workout_logs` row still exists with `exercise_id = null` and its original `exercise_name`. Separately, seed a fresh plan + exercise + log, delete the plan — assert the exercise and the `workout_logs` row are both gone.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` — full suite (Phases 2-4) passes against a freshly reset local Supabase
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Full local run confirmed end-to-end: `supabase start && supabase db reset && npm run test:integration` succeeds from a clean state

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None planned in this phase — every risk here requires real RLS/GRANT enforcement or the real request path, which mocking would bypass.

### Integration Tests:

- Phases 2 and 4: DB-layer, against a local Supabase instance, using the two-fixture-user harness.
- Phase 3: route-layer, against a local Supabase instance plus a real running dev server.

### Manual Testing Steps:

1. `supabase start`, `supabase db reset`.
2. Copy `.env.test.example` to `.env.test` with the printed local service-role key.
3. `npm run test:integration` — confirm all phases pass.
4. Temporarily revert `20260703140000_harden_exercises_plan_ownership_rls.sql`, re-run, confirm the exercises regression test fails, then restore it.

## Performance Considerations

None beyond keeping the suite fast enough for local iteration. DB-layer tests (Phases 2, 4) should run in well under a few seconds each; the Phase 3 dev-server boot is the one deliberately slower step, isolated to its own file so it doesn't block the faster DB-layer suites.

## Migration Notes

No schema changes in this phase — it only adds tests plus the harness/config files listed above.

## References

- Test plan: `context/foundation/test-plan.md` (§2 Risk Map #1-#4, §3 Phase 1)
- Historical bug fixed: `supabase/migrations/20260703140000_harden_exercises_plan_ownership_rls.sql`
- workout_logs GRANT: `supabase/migrations/20260703161941_create_workout_logs_schema.sql`
- Prior implementation patterns: `context/changes/create-and-manage-training-plan/plan.md`, `context/changes/log-workout-against-plan/plan.md`
- Supabase client: `src/lib/supabase.ts`
- Middleware: `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness bootstrap — Vitest, fixture users, README fix

#### Automated

- [x] 1.1 `npm install` completes with vitest added — 6bae265
- [x] 1.2 `npm run test:integration` runs without configuration errors — 6bae265
- [x] 1.3 Linting passes — 6bae265
- [x] 1.4 Build passes — 6bae265

#### Manual

- [x] 1.5 `createFixtureUser()`/`deleteFixtureUser()` leave no residual rows in `auth.users` — 6bae265
- [x] 1.6 Updated README line accurately describes the `supabase db reset` step — 6bae265

### Phase 2: Ownership / RLS / GRANT integration tests

#### Automated

- [x] 2.1 All Phase 2 test files pass against a freshly reset local Supabase — 05a52df
- [x] 2.2 Linting passes — 05a52df
- [x] 2.3 Build passes — 05a52df

#### Manual

- [x] 2.4 Reverting the hardening migration causes the plan_id-squatting regression test to fail — 05a52df

### Phase 3: API-route authorization (IDOR) tests

#### Automated

- [x] 3.1 Phase 3 test file passes against local Supabase + local dev server — 1d3b78d
- [x] 3.2 Linting passes — 1d3b78d
- [x] 3.3 Build passes — 1d3b78d

#### Manual

- [x] 3.4 Dev-server helper cleanly terminates the spawned process after the suite — 1d3b78d

### Phase 4: ON DELETE cascade behavior tests

#### Automated

- [x] 4.1 Full suite (Phases 2-4) passes against a freshly reset local Supabase — 78b2760
- [x] 4.2 Linting passes — 78b2760
- [x] 4.3 Build passes — 78b2760

#### Manual

- [x] 4.4 Full local run confirmed end-to-end from a clean state — 78b2760
