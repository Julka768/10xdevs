# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-22 (Phase 2 complete)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (excluding `node_modules`, `dist`, build output). 42 commits in the last 30 days — sufficient signal.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | RLS/GRANT regression on new domain tables (goals, calories, measurements) — a policy exists but the matching GRANT is missing (or vice versa), silently blocking legitimate access or failing to enforce ownership | High | High | interview Q1 (scenario 3); `context/foundation/lessons.md` (RLS/GRANT pairing rule); roadmap S-03/S-04/S-05 (ready, not started); hot-spot dir `supabase/migrations/` (5 commits/30d) |
| 2 | A workout log (or future goal/calorie/measurement row) is silently attributed to the wrong plan, exercise, or account | High | Medium | interview Q1 (scenario 1); PRD guardrails (data never lost/corrupted, never cross-user visible); hot-spot dir `src/lib/` (6 commits/30d) |
| 3 | Authorization/IDOR: a CRUD API route is reached with another user's row id and relies on RLS as the only enforcement boundary, unverified at the route layer | High | Medium | PRD Access Control section; archived plan `context/changes/log-workout-against-plan/plan.md` (explicit "RLS/GRANTs are the actual enforcement boundary" reasoning); hot-spot dir `src/pages/api/plans/` (9 commits/30d) — abuse/security lens |
| 4 | Silent data loss/corruption via an unreviewed `ON DELETE` cascade on a new domain table | High | Medium | PRD guardrail (logged data never lost or corrupted); archived plan `context/changes/log-workout-against-plan/plan.md` (explicit `ON DELETE SET NULL` + snapshot design for exercise deletion) |
| 5 | Weekly report (FR-008) computes the wrong training-volume trend, measurement delta, or calorie-vs-goal verdict once built | High | Medium | PRD Business Logic section; PRD Success Criteria; roadmap S-06 (waits on S-02/S-03/S-04/S-05 + one full prior week of data) |
| 6 | Date/timezone edge case in future-date rejection or week-boundary math (workout logs already designed around this once; measurements/report will reuse or reimplement it) | Medium | Medium | archived plan `context/changes/log-workout-against-plan/plan.md` (explicit off-by-one avoidance note); PRD FR-007 (weekly cadence) / FR-008 (week-over-week comparison); roadmap S-05 (not started) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|---|---|---|---|---|
| #1 | Per new table: cross-user CRUD is rejected AND same-user CRUD still succeeds (a missing GRANT breaks the legitimate case too) | "Policy exists" implies "GRANT exists" — the two must be verified independently | Each new migration pairs `enable row level security` with the matching `grant`; the actual `using`/`with check` clauses | integration (real local Supabase, two seeded users) | Schema-introspection test that checks SQL text presence instead of an actual authenticated cross-user attempt |
| #2 | A log/entry created under account A's plan/exercise is never readable or re-attributable under account B; its ownership fields can't be redirected via update | "200 redirect" is not evidence of correct attribution — must check the persisted row | Exact ownership-check shape at insert (RLS `with check` vs. app-layer lookup vs. both); which fields the UPDATE grant restricts | integration (real DB, two seeded users) | Asserting only HTTP status/redirect location instead of the persisted row's ownership columns |
| #3 | Hitting an update/delete route with another user's row id, under a *different* user's session, causes no mutation and no data exposure (clean error, not a 500 leaking detail) | "Route uses the user's own session, so RLS handles it" — must verify no route path uses a service-role/bypass client | Which Supabase client each CRUD route instantiates; confirm none elevate privilege | integration (API-route level, two seeded users, cross-id requests) | Testing only the DB-level RLS policy and assuming every route calls it correctly |
| #4 | Deleting a parent row never silently deletes/corrupts a historical row that should survive it; each new table's `ON DELETE` behavior is a deliberate, verified choice | "No explicit `ON DELETE` clause is safe" — Postgres default is `NO ACTION`, not automatically the right choice | The actual `ON DELETE` clause on every FK touching historical/logged data, per new migration | integration (seed row + dependent history, delete parent, assert exact post-state) | Only testing the happy path where nothing is ever deleted |
| #5 | Given two weeks of fixture data, the report's per-exercise trend, each measurement delta, and the calorie-vs-goal verdict match independently hand-computed values, including a "flat" (zero-change) case and a no-prior-week case | "Query ran without error" is not correctness — expected values must come from an independent calculation, never copied from the implementation (oracle problem) | Exact volume formula (not spelled out in PRD); definition of "prior week" (calendar vs. rolling 7 days); no-prior-week UX | unit/integration on the report-computation logic, fixture-seeded | Deriving "expected" test values by reading the implementation's own formula |
| #6 | Logging near local midnight and near a week boundary attributes to the correct calendar day/week in the user's timezone, not the server's; a same-day late-night entry is accepted, not rejected as "future" | The workout-log fix (string comparison, not `Date` `<=`) is *reused*, not reimplemented differently, for measurements (S-05) and the report's week math (S-06) | The exact date-comparison approach already shipped for `workout_logs.logged_at` | unit, parametrized across a few UTC offsets | Testing only in the server's local timezone (likely UTC in CI/Workers), missing the case that actually matters |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path integrity & authorization | Bootstrap the integration test runner + a two-seeded-user Supabase fixture harness, then prove ownership/attribution/cascade/authorization correctness across every existing and upcoming domain table | #1, #2, #3, #4 | integration | complete | `context/changes/testing-critical-path-integrity/` |
| 2 | Weekly report correctness | Prove FR-008's volume-trend/measurement-delta/calorie-vs-goal computation against independently hand-computed fixture data, once S-06 is built | #5 | unit | complete | `context/changes/weekly-progress-report/` (folded into S-06's own plan rather than its own change folder — see note below) |
| 3 | Date/timezone boundary hardening | Unit-test the date/week-boundary logic shared across logging and reporting, parametrized across timezones | #6 | unit | not started | — |
| 4 | Quality-gates wiring | Require the new integration/unit suites in CI alongside the existing lint+build gate | cross-cutting | gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | ^4.1.9 | `tests/unit/**` (pure logic, no external services, `npm run test:unit`) and `tests/integration/**` (real local Supabase + two-seeded-user fixtures, `npm run test:integration`) both landed; see §3 Phases 1-2. checked: 2026-08-22 |
| API/route integration | none yet — see Phase 1 | — | two-seeded-user harness against local Supabase (`supabase start`), per §2 Risk Response Guidance #1–#4 |
| e2e | not planned | — | no rollout phase adds this; app is deterministic CRUD, integration layer covers the risk map |
| accessibility | not planned | — | no rollout phase adds this; out of scope for this rollout's risk map |
| (optional) AI-native | not planned | — | no canvas-only UI or uncertain LLM behavior in this product; cost × signal doesn't justify it (see §1) |

**Stack grounding tools (current session):**
- Docs: none available in current session (no Context7/framework-docs MCP) — will rely on official docs via `WebFetch` if a specific setup question arises; checked: 2026-07-03
- Search: none available in current session (no Exa/dedicated search MCP) — generic `WebSearch` only; checked: 2026-07-03
- Runtime/browser: none available in current session (no Playwright/browser MCP) — not used; checked: 2026-07-03
- Provider/platform: GitHub reachable via `gh` CLI (not MCP) — roadmap issues already tracked there, could support future quality-gate/CI checks; checked: 2026-07-03

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI (`.github/workflows/ci.yml`) | required (already wired) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | ownership/attribution/cascade/authorization regressions |
| unit (date/timezone) | local + CI | required after §3 Phase 3 | week/day-boundary regressions |
| CI gate wiring for new suites | CI | required after §3 Phase 4 | regressions merged without running the new suites |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding an integration test for a domain table (ownership/RLS/cascade)

- TBD — see §3 Phase 1 (will cover the ownership/attribution/cascade pattern for Risks #1, #2, #4).

### 6.2 Adding an integration test for an API route (authorization)

- TBD — see §3 Phase 1 (will cover the two-seeded-user cross-id pattern for Risk #3).

### 6.3 Adding a test for the weekly report computation

Landed in `tests/unit/date-utils.test.ts` and `tests/unit/weekly-report.test.ts` (2026-08-22, via `context/changes/weekly-progress-report/`, folded into S-06's own implementation rather than opened as a separate change). Pattern: the report computation lives as pure functions (`src/lib/date-utils.ts`, `src/lib/weekly-report.ts`) with zero I/O — no Supabase calls, no fixture-user harness needed. Each test builds a literal fixture (an array of row objects) and asserts against an expected value computed by hand in the test/plan itself, never by reading the implementation's own formula (the anti-pattern this risk explicitly warns against). Run with `npm run test:unit` — no local Supabase instance required, unlike the integration suite.

### 6.4 Adding a date/timezone boundary test

- TBD — see §3 Phase 3 (will cover the parametrized-UTC-offset pattern for Risk #6).

### 6.5 Per-rollout-phase notes

(Filled in as each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Free-text exercise-name entry** — typos/duplicate exercise names are an explicitly accepted PRD risk (no shared exercise library for v1), not a defect to catch. Re-evaluate if a shared exercise library is added post-MVP. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-07-03
- Stack versions last verified: 2026-07-03
- AI-native tool references last verified: 2026-07-03

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
