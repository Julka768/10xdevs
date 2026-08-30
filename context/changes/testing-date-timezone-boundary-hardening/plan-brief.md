# Date/Timezone Boundary Hardening — Plan Brief

> Full plan: `context/changes/testing-date-timezone-boundary-hardening/plan.md`

## What & Why

The "date cannot be in the future" check used by workout logs, body measurements, and calorie logs rejects a legitimate same-day entry for users in timezones ahead of UTC, because it compares against UTC "today" — the server has no way to know the submitter's real local date. This is test-plan rollout Phase 3 (`context/foundation/test-plan.md` §3, risk #6): fix the bug and lock it down with unit tests.

## Starting Point

Three validation files (`training-plan.ts`, `measurements.ts`, `calories.ts`) each independently implement the identical, buggy check: `value <= new Date().toISOString().slice(0, 10)`. `date-utils.ts` already has one precedent for testable date logic (`getWeekBounds`, which takes its reference time as a parameter), but nothing tests the future-date check today, and no test in the repo mocks the system clock.

## Desired End State

A single `isNotFutureDate(value, now)` function in `date-utils.ts` backs all three forms. Submitting today's date always works, regardless of the user's timezone (up to a one-day grace window); submitting a date more than one day out is still rejected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Fix vs. test-only | Fix the bug, not just characterize it | Test-plan rollout exists to close the risk, not document it | Plan (user decision) |
| Duplication | Consolidate 3 copies into 1 shared function | One fix location, one test suite, matches the existing `getWeekBounds` pattern | Plan (user decision) |
| Testability | Inject `now: Date` as a parameter | Matches `getWeekBounds`'s existing contract; fully deterministic, no time-mocking library needed | Plan (user decision) |
| Fix mechanism | One-day grace window (`<= tomorrow`), not real timezone capture | Server never receives a timezone offset from the plain `<input type="date">` forms; a grace window covers the worst case (UTC+14) without adding client-side JS | Plan (user decision) |
| `getWeekBounds` scope | No changes | It's deliberately UTC-only by design and already adequately tested | Plan (user decision) |

## Scope

**In scope:** new `isNotFutureDate` function, its use in the three validation schemas, unit tests for the boundary.

**Out of scope:** capturing real client timezone (no new form fields/JS), changes to `getWeekBounds` or the weekly report, changes to any API route, integration tests.

## Architecture / Approach

Single pure function added to `src/lib/date-utils.ts`, imported by the three Zod schemas that currently duplicate the check inline. Tests extend the existing `tests/unit/date-utils.test.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Shared date check, consolidation, and boundary tests | Bug fixed in all three domains at once via one shared function + tests proving the boundary | The one-day grace window is an approximation, not a precise per-user-timezone fix — acceptable per the "Fix mechanism" decision above |

**Prerequisites:** None — self-contained, no dependency on other in-flight work.
**Estimated effort:** Small — one session, one phase.

## Open Risks & Assumptions

- The one-day grace window means a user behind UTC (e.g. UTC-8) could technically submit a date one calendar day further into the future than strictly correct for them. Accepted tradeoff (see "Fix mechanism" above).

## Success Criteria (Summary)

- Today's date is always accepted in all three forms, regardless of server/user timezone skew.
- A date more than one day out is still rejected with the existing error message.
- The fix is proven by unit tests, not just manual spot-checks.
