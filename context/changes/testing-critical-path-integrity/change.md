---
change_id: testing-critical-path-integrity
title: Critical-path integrity & authorization tests (test-plan rollout Phase 1)
status: impl_reviewed
created: 2026-07-04
updated: 2026-07-04
archived_at: null
---

## Notes

Resolved from `context/foundation/test-plan.md` §3 Phase 1 ("Critical-path integrity & authorization") — the first rollout phase of the phased test-plan strategy.

- **Goal:** Bootstrap the project's first test runner + a two-seeded-user Supabase fixture harness, then prove ownership/attribution/cascade/authorization correctness across `training_plans`, `exercises`, `workout_logs`.
- **Risks covered:** #1 (RLS/GRANT regression on new tables), #2 (wrong-attribution write), #3 (authorization/IDOR across API routes), #4 (silent data loss via unreviewed `ON DELETE` cascade).
- **Test types:** integration.
- **Research skipped** — `/10x-plan` was invoked directly against `context/foundation/test-plan.md`'s existing risk map + response guidance, which already grounded most of the "why"; codebase-specific facts (client instantiation, exact RLS/GRANT clauses, cascade behavior, route structure) were gathered via an Explore sub-agent during planning instead of a separate `/10x-research` pass.
