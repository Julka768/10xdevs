<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Log Weekly Body Measurements Implementation Plan

- **Plan**: context/changes/log-weekly-measurements/plan.md
- **Scope**: Phase 6 of 6 (full plan review)
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Concurrent double-submit can silently drop a custom measurement value

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/measurement-values.ts:28-39
- **Detail**: `syncCustomMeasurementValues` does an explicit update-then-insert-if-absent per custom type (required because the Phase 4 `measurement_values` update GRANT is column-scoped to `value` only, so `.upsert()` isn't usable — see the plan's Critical Implementation Details). Under two concurrent requests for the same `(measurement_id, type_id)` (e.g. a double-submit), both can see `updated.length === 0` at the update step and both fall through to insert. The second insert violates the `unique (measurement_id, type_id)` constraint, but its `{error}` is discarded (line 36-38) rather than checked — unlike every other insert in this slice (`measurements/index.ts:36`, `measurement-types/index.ts:40`, both of which do check `error`). The request still redirects as success, and one of the two writes is silently lost with no user-visible indication.
- **Fix**: Capture the insert's `{ error }` and, on a conflict (Postgres unique-violation, code `23505`), retry as an `.update({ value })` against the same `(measurement_id, type_id)` instead of discarding — this gives last-write-wins semantics consistent with how the rest of this function already treats a resubmitted value, closing the silent-loss window without needing `.upsert()`.
- **Decision**: FIXED

### F2 — TOCTOU race on the 10-custom-type limit

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/measurement-types/index.ts:23-32
- **Detail**: The count-then-insert check for the 10-type cap is not atomic — two concurrent "add type" submissions could both read `count = 9` and both insert, momentarily yielding 11 rows. This is a soft UX limit on a user's own data, not a security boundary (RLS already scopes every row to `auth.uid()`), and the app's single-user-editing-their-own-data concurrency profile makes this an unlikely, low-stakes edge case.
- **Decision**: SKIPPED — acceptable given the app's concurrency profile; a DB-level constraint or trigger would be disproportionate complexity for a soft limit of this kind.

## Success Criteria Verification

**Automated** (re-run at full-plan-review time, after all 6 phases' commits):
- `npx supabase db reset` — PASS (all 7 migrations, including both new ones from this change, apply cleanly)
- `npm run build` — PASS (no type errors across all 6 phases' combined code)
- `npm run lint` — PASS (0 errors)

**Manual** (all 33 Progress manual items across Phases 1-6 marked `[x]`, user-confirmed live in-browser; Phase 1 items were confirmed before the Phase 2 commit, Phase 2's confirmed together with Phase 3, Phase 4's together with Phase 5, and Phase 5's together with Phase 6 — each deferred-confirmation pair follows the same pattern already accepted in this project's `log-daily-calories` review):
- Phase 1 (1.4–1.7): cross-user RLS insert rejection, future-date CHECK rejection, multi-entry-per-day acceptance, weight-only entry acceptance — confirmed.
- Phase 2 (2.3–2.8): future-date rejection, weight-only/full creation, optional-field clearing to `null` on edit, delete, cross-user update/delete rejection — confirmed together with Phase 3.
- Phase 3 (3.3–3.7): dashboard teaser, nav link, date grouping, cross-user isolation, inline edit/cancel — confirmed.
- Phase 4 (4.4–4.6): cross-user FK-forgery rejection, cascade delete, unique-constraint rejection — confirmed together with Phase 5.
- Phase 5 (5.3–5.8): 10-type limit, rename isolation, delete cascade, value creation, value-clearing deletion, forged-field rejection — confirmed together with Phase 6.
- Phase 6 (6.3–6.7): dynamic field appears on type add, rename propagation, delete removes field+history, round-trip create/edit, cross-user isolation for types/values — confirmed.

No rubber-stamping concern: both review sub-agents independently read the actual diff and confirmed direct evidence for every Contract in the plan (RLS subquery text, column-scoped GRANT statement, `optionalMeasurement`'s null-not-undefined resolution, absence of `.upsert()`, alphabetical `database.types.ts` placement) — this was a full-code verification, not a checkbox-count.

## Scope Note

This plan grew mid-implementation: Phases 1-3 (fixed `body_measurements` columns) shipped first and passed manual testing; user feedback then surfaced a real requirement gap (ability to add/rename custom measurement types), which was planned and added as Phases 4-6 additively, without reworking the already-shipped fixed-column schema. Both review sub-agents confirmed the extension respects the guardrails set at that point: built-in fields remain un-renameable, `weight` was never absorbed into the flexible type system, and no unit-selector/imperial scope crept in alongside it.
