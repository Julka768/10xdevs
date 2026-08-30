<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Quality-Gates Wiring Implementation Plan

- **Plan**: context/changes/testing-quality-gates-wiring/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-08-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

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

### F1 — Env-export step's `grep`-inside-`$(...)` failure isn't caught by `set -e`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/ci.yml:40-48`

**Detail**: GitHub Actions' default bash shell runs with `-eo pipefail`, but that doesn't propagate a failed command's exit status when it's only used inside a `$(...)` substitution feeding another command (a well-known bash gotcha). If `grep '^SUPABASE_URL='` (or the anon-key grep) ever finds no match — e.g. `supabase status -o env`'s field names shift in a future CLI version — `grep` exits 1, but the enclosing `echo "SUPABASE_URL=$(...)"` still exits 0. The step reports success while silently writing `.env` with an empty `SUPABASE_URL=`. Impact is bounded, not silently-green-forever: `tests/integration/support/fixture-users.ts`/`session-cookie.ts` both call `requireEnv(...)`, which throws once the empty value reaches it — so `npm run test:integration` still fails the job overall. But the failure surfaces several steps downstream with a message that doesn't point at the real root cause, costing debugging time if the CLI's output format ever shifts.

**Fix**: Add a guard right after the `.env` write (line 48) that fails the step immediately with a clear message if either value came out empty, e.g. `grep -q '^SUPABASE_URL=.\+' .env && grep -q '^SUPABASE_KEY=.\+' .env || { echo "::error::Failed to extract Supabase env vars"; exit 1; }`.

- **Decision**: FIXED — guard added at `.github/workflows/ci.yml:49`; verified locally (bash) that it passes silently on valid values and fails loudly with `::error::` + exit 1 on an empty value.
