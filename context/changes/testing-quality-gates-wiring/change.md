---
change_id: testing-quality-gates-wiring
title: Quality-gates wiring — require test suites in CI (test-plan rollout Phase 4)
status: impl_reviewed
created: 2026-08-30
updated: 2026-08-30
archived_at: null
---

## Notes

Resolved from `context/foundation/test-plan.md` §3 Phase 4 ("Quality-gates wiring") — the fourth and final rollout phase of the phased test-plan strategy.

- **Goal:** Require the new integration/unit suites in CI alongside the existing lint+build gate.
- **Risks covered:** cross-cutting — not a specific numbered risk. This phase locks in the floor for all risks #1-#6 by making their tests mandatory, not optional.
- **Response intent:** today `.github/workflows/ci.yml`'s `ci` job only runs `npm run lint` and `npm run build`. The unit suite (23 tests, includes Phase 3's date/timezone boundary tests) and integration suite (15 tests, includes Phase 1's cross-user RLS/authorization/cascade tests) both exist and pass locally but are not required by CI — a regression in either would currently merge to `master` undetected. Require both suites in the `ci` job so a red test blocks the PR the same way a lint/build failure already does. Integration tests need a running local Supabase instance (`supabase start`) — the concrete plumbing to ground: does GitHub Actions support spinning up the Supabase CLI/Docker stack inside the `ci` job, or does it need a different strategy (e.g. a services container, or splitting unit-only into `ci` and integration into its own job with its own setup)?
- **Test types:** gates.
