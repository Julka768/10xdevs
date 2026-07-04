<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-Path Integrity & Authorization Tests

- **Plan**: context/changes/testing-critical-path-integrity/plan.md
- **Scope**: Full plan (Phases 1-4 of 4)
- **Date**: 2026-07-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — No guardrail against a non-local SUPABASE_URL in the fixture harness

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/fixture-users.ts:20-26
- **Detail**: `serviceRoleClient()` constructs a service-role client from whatever `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` happen to be in `.env.test`, with no check that the URL is actually local. The harness uses this client to freely create/delete auth users and insert/update/delete rows across `training_plans`/`exercises`/`workout_logs` (used by all of Phases 2-4). A misconfigured `.env.test` pointing at a staging/production Supabase project would corrupt real data with no warning. This applies retroactively to the whole harness, not just Phase 4.
- **Fix**: In `serviceRoleClient()`, assert `new URL(SUPABASE_URL).hostname` is `localhost`/`127.0.0.1` before constructing the client; throw a clear error otherwise.
  - Strength: Single choke point (`fixture-users.ts` is the only file that ever touches the service-role key), so one guard covers every test file.
  - Tradeoff: Slightly rigid if the harness is ever legitimately pointed at a non-localhost local Supabase (e.g. a devcontainer hostname) — would need an allowlist, not just a literal match.
  - Confidence: HIGH — the risk is real (unbounded service-role writes) and the fix is a well-contained one-time check.
  - Blind spot: Haven't checked whether any CI config might reasonably use a non-localhost hostname for a containerized Supabase; worth a quick check before landing the exact match list.
- **Decision**: FIXED — added `assertLocalSupabaseUrl()` guard in `fixture-users.ts`, called from `serviceRoleClient()`.

### F2 — Orphaned dev-server process on readiness timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/dev-server.ts:44-57
- **Detail**: `startDevServer()` spawns `child` then awaits `waitUntilReady` unguarded. If that throws (30s timeout, dev-server.ts:39-41), `child` is never killed and no handle is returned — an orphaned `astro dev` process stays bound to port 4399 after any timed-out run.
- **Fix**: Wrap the `waitUntilReady` call in try/catch inside `startDevServer`; on catch, call `killProcessTree(child.pid)` then rethrow.
- **Decision**: FIXED — added try/catch around `waitUntilReady` in `startDevServer()`.

### F3 — `afterAll` crashes and masks the real failure if `beforeAll` throws

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/routes/plans-authorization.test.ts:88-95
- **Detail**: `devServer` is only assigned once `startDevServer()` resolves. If `beforeAll` throws (e.g. due to F2), `devServer` stays `undefined` and `afterAll`'s `await devServer.stop()` throws a `TypeError`, masking the original failure in the test output and skipping cleanup.
- **Fix**: Guard with `if (devServer) await devServer.stop();` in `afterAll`.
- **Decision**: FIXED — added the guard; widened `devServer`'s type to `DevServerHandle | undefined` to keep the guard meaningful under `@typescript-eslint/no-unnecessary-condition`.

### F4 — `seedPlanExerciseLog` duplicated identically across three test files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/rls/workout-logs.test.ts:6-40, tests/integration/rls/cascade-behavior.test.ts:6-40, tests/integration/routes/plans-authorization.test.ts:48-82
- **Detail**: The same plan+exercise+log seeding helper is defined byte-for-byte in three separate files across two phases (Phase 2 and Phase 4, plus Phase 3's route test). Any schema change (new required column, renamed field) needs three synchronized edits and can silently drift out of sync.
- **Fix**: Extract to `tests/integration/support/seed.ts` (`seedPlanExerciseLog(client, userId)`) and import it in all three test files.
- **Decision**: FIXED — extracted to `tests/integration/support/seed.ts`; all 3 call sites now import it. Full suite re-verified: 15/15 tests pass, lint clean, build clean.

### F5 — `session-cookie.ts` not named in Phase 3's plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/integration/support/session-cookie.ts (whole file); plan.md Phase 3 "Changes Required"
- **Detail**: Phase 3's plan names only `dev-server.ts` and `plans-authorization.test.ts` as new files, but a third support file, `session-cookie.ts`, shipped alongside them — a reasonable single-responsibility extraction (derives a real `Cookie` header via `@supabase/ssr`'s `createServerClient` storage adapter) rather than scope creep, but undocumented in the plan text.
- **Fix**: Amend Phase 3's "Changes Required" #1 to list `session-cookie.ts` alongside `dev-server.ts` (documentation-only, no code change).
- **Decision**: FIXED — amended `plan.md` Phase 3 #1 to name and describe `session-cookie.ts`.

### F6 — `.env.test.example` contract under-specifies the `SUPABASE_ANON_KEY` requirement

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .env.test.example; plan.md Phase 1 #2 contract
- **Detail**: The plan's contract says `.env.test.example` documents `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The actual file also documents `SUPABASE_ANON_KEY`, which is genuinely required (`fixture-users.ts:6,49` and `session-cookie.ts:6,33` both consume it) — a necessary addition, not scope creep, but the plan text didn't anticipate it.
- **Fix**: Amend Phase 1 #2's contract text to include `SUPABASE_ANON_KEY` (documentation-only).
- **Decision**: FIXED — amended `plan.md` Phase 1 #2 contract text.

### F7 — `stop()` silently resolves on a stuck process

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/support/dev-server.ts:63-72
- **Detail**: The 5000ms fallback in `stop()` resolves without checking whether the process actually exited, so a stuck process after `taskkill`/`SIGTERM` fails silently with no diagnostic.
- **Fix**: Log a warning if the process hasn't exited by the time the 5s fallback fires.
- **Decision**: FIXED — added a `console.warn` in the 5s fallback path when `child.exitCode` is still `null`.

## Positive confirmations (not findings)

- Zero occurrences of `SUPABASE_SERVICE_ROLE_KEY`/`service_role` anywhere under `src/` — the service-role key is confined entirely to `fixture-users.ts`, never leaking into app code.
- `.env.test` is genuinely gitignored (confirmed via `git check-ignore`), distinct from the committed `.env.test.example` placeholder.
- `dev-server.ts` spawns `npm` with a fixed argument array and a hardcoded port constant — no command-injection surface.
- All 4 phases' automated success criteria verified green this session: `npm run test:integration` (15/15 tests, 5 files), `npm run lint`, `npm run build`.
- All Progress checkboxes across Phases 1-4 are `[x]` with commit SHAs attached; `change.md.status` was `implemented` prior to this review.
