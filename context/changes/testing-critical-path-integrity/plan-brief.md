# Critical-Path Integrity & Authorization Tests — Plan Brief

> Full plan: `context/changes/testing-critical-path-integrity/plan.md`

## What & Why

This project has zero automated tests today, and the top risks on `context/foundation/test-plan.md`'s risk map are exactly the kind mocking can't catch: RLS/GRANT correctness, cross-account write attribution, API-route authorization (IDOR), and `ON DELETE` cascade behavior. One of these risks — a plan_id-squatting bug in the `exercises` table — has already happened once and needed a follow-up hardening migration. This plan bootstraps the first test runner and locks in these four risks before two more domain tables (goals, calories) are added by hand using the same error-prone pattern.

## Starting Point

No test runner, config, or test files exist anywhere in the repo. Three domain tables exist (`training_plans`, `exercises`, `workout_logs`), each with hand-written RLS policies and GRANTs; every API route uses the anon-key + cookie-session Supabase client, with several mutation routes relying entirely on RLS (no app-layer ownership check at all). All existing verification of RLS correctness so far has been manual (see the `create-and-manage-training-plan` and `log-workout-against-plan` plans' Manual Verification steps).

## Desired End State

Running `npm run test:integration` against a locally reset Supabase instance automatically verifies: no user can read/write another user's rows in any of the 3 tables; the `exercises` plan_id-squatting bug can never silently regress; `workout_logs`' column-scoped UPDATE grant actually blocks touching immutable fields; every mutation route rejects cross-account requests cleanly (no mutation, no 500); and delete cascades behave exactly as designed (plan deletion cascades, exercise deletion nulls out the log's exercise link without deleting the log).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Route-test invocation | Real dev server + real HTTP, not a mocked `APIContext` | IDOR is a routing/middleware-boundary concern — a hand-built mock context risks missing exactly that boundary | Plan (user-confirmed) |
| Test runner | Vitest, plain Node environment | No route under test touches Workers-specific bindings (KV/R2/DO), so Workers-runtime fidelity adds no signal | Plan (user-confirmed) |
| Fixture-user creation | Local-only service-role key + admin API | Fast, deterministic, no email-confirmation flow to fight; key is test-scoped and never touches app code | Plan (user-confirmed) |
| Regression coverage | Explicit test for the already-fixed plan_id-squatting bug | It's a known, already-occurred bug — cheapest possible way to lock in a fix that's already paid for | Plan (user-confirmed) |
| GRANT-level test | Explicit privilege-escalation attempt on `workout_logs` UPDATE | Distinct enforcement layer from RLS; the immutability invariant is explicitly load-bearing per the archived plan | Plan (user-confirmed) |
| Table scope | `training_plans` + `exercises` + `workout_logs` only | `goals`/`calories`/`measurements` don't exist yet; testing against nonexistent schema is the "describing the implementation" anti-pattern | Plan (user-confirmed) |
| README fix | Small drive-by fix to the stale migrations line | The new harness depends on `supabase db reset` actually running; a new contributor following the stale line would silently miss it | Plan (user-confirmed) |

## Scope

**In scope:** Vitest bootstrap, two-fixture-user harness (service-role-backed), RLS/GRANT ownership tests for all 3 existing tables, the plan_id-squatting regression test, the workout_logs GRANT privilege-escalation test, route-level IDOR tests against all 8 id-scoped mutation routes, cascade-behavior tests, one README line fix.

**Out of scope:** `goals`/`calories`/`measurements` tables (not built yet), CI wiring (rollout Phase 4), e2e/browser tests, the weekly report (Risk #5) and date/timezone boundaries (Risk #6) — separate rollout phases.

## Architecture / Approach

Two layers of integration test, sharing one fixture harness: (1) DB-layer tests call `supabase-js` directly against a local Supabase instance to verify RLS/GRANT/cascade behavior (Phases 2, 4) — fast, no server needed; (2) route-layer tests (Phase 3) additionally start a real `astro dev` process and issue real HTTP requests with real session cookies, to verify the actual deployed request path rejects cross-account access. The service-role key used only to create/delete fixture users is kept in a gitignored `.env.test`, fully separate from the app's own anon-key client.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Harness bootstrap | Vitest + fixture-user harness + README fix | Service-role key scope must stay test-only |
| 2. Ownership/RLS/GRANT tests | Cross-user rejection + regression + GRANT tests for all 3 tables | Regression test must actually fail without the fix (verified manually) |
| 3. Route authorization (IDOR) tests | Real-HTTP cross-account tests for 8 mutation routes | Dev-server lifecycle must clean up reliably |
| 4. Cascade behavior tests | Delete-cascade/SET NULL verification | None significant — smallest, most isolated phase |

**Prerequisites:** Local Supabase CLI (`2.109.0`, already pinned) and Docker running locally for `supabase start`.
**Estimated effort:** ~1-2 sessions across 4 phases — mostly harness/config work in Phase 1, then mechanical repetition across Phases 2-4.

## Open Risks & Assumptions

- Assumes the installed `supabase-js` version supports `admin.createUser` + `signInWithPassword` cleanly for fixture setup; if not, `dev-server.ts`/`fixture-users.ts` may need a session-exchange fallback.
- Assumes `astro dev` boots reliably enough in a test's `beforeAll` for CI use later (Phase 4 of the rollout) — not verified here since this phase only requires local runs.

## Success Criteria (Summary)

- `npm run test:integration` passes locally from a clean `supabase db reset`, covering all 4 risks (#1-#4) across all 3 existing tables.
- The plan_id-squatting regression test fails if the hardening migration is reverted (proves it's a real regression guard, not a tautology).
- Lint and build remain green throughout.
