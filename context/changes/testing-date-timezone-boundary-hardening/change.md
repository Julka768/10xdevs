---
change_id: testing-date-timezone-boundary-hardening
title: Date/timezone boundary hardening tests (test-plan rollout Phase 3)
status: planned
created: 2026-08-30
updated: 2026-08-30
archived_at: null
---

## Notes

Resolved from `context/foundation/test-plan.md` §3 Phase 3 ("Date/timezone boundary hardening") — the third rollout phase of the phased test-plan strategy.

- **Goal:** Unit-test the date/week-boundary logic shared across logging and reporting, parametrized across timezones.
- **Risks covered:** #6 — a date/timezone edge case in future-date rejection or week-boundary math. Logging near local midnight and near a week boundary must attribute to the correct calendar day/week in the user's timezone, not the server's; a same-day late-night entry must be accepted, not rejected as "future".
- **Response intent:** the workout-log fix (string comparison of `logged_at` against `new Date().toISOString().slice(0, 10)`, not a `Date <=` comparison) must be *reused*, not reimplemented differently, for measurements (S-05) and the report's week math (S-06). Anti-pattern to avoid: testing only in the server's local timezone (likely UTC in CI/Workers), which would miss the offset that actually matters.
- **Test types:** unit.
