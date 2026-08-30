# Date/Timezone Boundary Hardening Implementation Plan

## Overview

Fix a real, currently-shipped bug where the "date cannot be in the future" check on `logged_at` (used by workout logs, body measurements, and calorie logs) rejects a legitimate same-calendar-day entry for users in timezones ahead of UTC, because the check compares the submitted date string against UTC "today" rather than the user's local "today" — which the server has no way to know, since the plain `<input type="date">` forms never send a timezone offset. Consolidate the three duplicated checks into one testable function and add a one-day grace window, then cover the boundary with unit tests. This is rollout Phase 3 of `context/foundation/test-plan.md` §3 (risk #6).

## Current State Analysis

Three separate Zod schemas independently implement the identical future-date check:

- `src/lib/validation/training-plan.ts:15-17` (`workoutLogInputSchema.logged_at`)
- `src/lib/validation/measurements.ts:15-17` (`measurementLogInputSchema.logged_at`)
- `src/lib/validation/calories.ts:5-7` (`calorieLogInputSchema.logged_at`)

Each does: `.refine((value) => value <= new Date().toISOString().slice(0, 10), { message: "Date cannot be in the future" })`.

`new Date().toISOString()` is always UTC. For a user in a timezone ahead of UTC (e.g. UTC+9, up to UTC+14), during the hours after their local midnight but before UTC's midnight, their local "today" is already one calendar day ahead of the server's UTC "today" — so submitting today's date is wrongly rejected as "in the future."

`src/lib/date-utils.ts` already holds one date-boundary function, `getWeekBounds(referenceDate: Date)`, which takes its reference time as an explicit parameter (not `new Date()` internally) specifically so it's directly unit-testable — this is the pattern to follow. `tests/unit/date-utils.test.ts` already tests `getWeekBounds` this way; no test today exercises the future-date check at all, and nothing in the codebase currently mocks the system clock (`vi.useFakeTimers`/`vi.setSystemTime` — unused).

## Desired End State

- One function, `isNotFutureDate(value: string, now: Date): boolean`, lives in `src/lib/date-utils.ts` and is the single implementation of the future-date check.
- All three validation schemas call it (passing `new Date()` at the call site) instead of duplicating the inline check.
- The check accepts a submitted date up to one day ahead of `now`'s UTC date (a one-day grace window), and still rejects anything further in the future.
- `tests/unit/date-utils.test.ts` proves the boundary: today (UTC) accepted, tomorrow (UTC) accepted (the grace window), the day after tomorrow rejected, yesterday accepted — each checked at both just-after-UTC-midnight and just-before-UTC-midnight instants, so the fix isn't accidentally time-of-day-dependent.

### Key Discoveries:

- `src/lib/date-utils.ts:17` — `getWeekBounds(referenceDate: Date)` is the existing precedent for "take `now` as a parameter, don't call `new Date()` internally," which `isNotFutureDate` should follow.
- The three `.refine()` call sites (`training-plan.ts:15-17`, `measurements.ts:15-17`, `calories.ts:5-7`) are byte-for-byte identical except for surrounding schema fields — safe to replace uniformly.
- No existing test mocks the system clock; this plan introduces the pattern (via passing an explicit `now: Date`, not `vi.useFakeTimers()`) rather than adding a new one.

## What We're NOT Doing

- Not capturing the client's real timezone offset (no new hidden form fields, no client-side JS in the Astro forms). The grace window is a deliberate approximation, not a precise per-user-timezone fix.
- Not touching `getWeekBounds` or adding timezone-parametrized tests to it — it's deliberately UTC-only by design and already has adequate coverage of that documented behavior.
- Not changing the API routes (`exercises/[exerciseId]/logs.ts`, `logs/[logId]/update.ts`, `measurements/index.ts`, `measurements/[id]/update.ts`, `calories/index.ts`, `calories/[id]/update.ts`) — they already just call `.safeParse()` on the schemas; no route-level change is needed.
- Not adding integration tests — this is a pure function boundary; unit tests are the cheapest layer that gives real signal (test-plan.md §1 principle #1).

## Implementation Approach

Add `isNotFutureDate` to `date-utils.ts` next to `getWeekBounds`, following the same "explicit reference time" contract. Replace the three duplicated `.refine()` bodies with a call to it. Extend the existing `tests/unit/date-utils.test.ts` file (not a new file) since it's already the home for date-boundary unit tests.

## Phase 1: Shared date check, consolidation, and boundary tests

### Overview

Add the shared function, wire it into the three schemas, and prove the boundary behavior with unit tests.

### Changes Required:

#### 1. Shared future-date check

**File**: `src/lib/date-utils.ts`

**Intent**: Add `isNotFutureDate`, the single implementation of "is this logged date acceptable," replacing the three duplicated inline checks. Takes `now` as an explicit parameter (not `new Date()` internally) so it's directly unit-testable, matching `getWeekBounds`'s existing contract.

**Contract**: `export function isNotFutureDate(value: string, now: Date): boolean`. Accepts `value` (a `YYYY-MM-DD` string) when it is not more than one UTC calendar day ahead of `now`. Implementation: compute `now`'s UTC date, add one day via `setUTCDate` (same technique `getWeekBounds` already uses for date arithmetic — not string manipulation), compare `value <= <that date>.toISOString().slice(0, 10)`.

#### 2. Wire the shared check into the three schemas

**File**: `src/lib/validation/training-plan.ts`

**Intent**: Replace `workoutLogInputSchema`'s inline future-date `.refine()` with a call to `isNotFutureDate`.

**Contract**: Import `isNotFutureDate` from `@/lib/date-utils`. `logged_at: z.string().refine((value) => isNotFutureDate(value, new Date()), { message: "Date cannot be in the future" })`. Error message text unchanged.

**File**: `src/lib/validation/measurements.ts`

**Intent**: Same replacement for `measurementLogInputSchema.logged_at`.

**Contract**: Same shape as above.

**File**: `src/lib/validation/calories.ts`

**Intent**: Same replacement for `calorieLogInputSchema.logged_at`.

**Contract**: Same shape as above.

#### 3. Boundary tests

**File**: `tests/unit/date-utils.test.ts`

**Intent**: Prove `isNotFutureDate`'s boundary in both directions — accepts the grace-window date, rejects beyond it — and that the boundary holds regardless of what time of day `now` is (the actual bug was time-of-day-dependent).

**Contract**: New `describe("isNotFutureDate", ...)` block, parametrized across at least two `now` instants (e.g. `2026-08-30T00:00:01Z` and `2026-08-30T23:59:59Z`) crossed with: `value` = `now`'s UTC date (accept), `value` = UTC date + 1 (accept — the grace window), `value` = UTC date + 2 (reject), `value` = UTC date − 1 (accept — the past is always fine, unchanged behavior).

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm run test:unit`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Submitting today's date in the workout log, measurement, and calorie forms is still accepted (no regression on the happy path)
- [ ] Submitting a date more than one day in the future in any of the three forms is still rejected with "Date cannot be in the future"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `isNotFutureDate` boundary (today/tomorrow/day-after/yesterday) at two different times of day in UTC, per Changes Required §3 above.

### Integration Tests:

- None added — this is a pure-function boundary; the existing integration suite already exercises the three log-creation routes end-to-end and is unaffected by this change (the routes still call `.safeParse()` the same way).

### Manual Testing Steps:

1. On the plan log page, submit an entry with today's date — confirm it's accepted.
2. Submit an entry with tomorrow's date — confirm it's accepted (grace window).
3. Submit an entry with a date 3 days from now — confirm it's rejected with "Date cannot be in the future".
4. Repeat steps 1–3 for the measurements form and the calories form.

## Performance Considerations

None — this is a pure string/date comparison, no change to query patterns or payload size.

## Migration Notes

None — no schema or data changes; this is application-layer validation logic only.

## References

- Test-plan rollout phase: `context/foundation/test-plan.md` §3 Phase 3 ("Date/timezone boundary hardening"), risk #6 in §2
- Existing precedent for injectable reference time: `src/lib/date-utils.ts:17` (`getWeekBounds`)
- Existing test convention: `tests/unit/date-utils.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared date check, consolidation, and boundary tests

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — a02cb5c
- [x] 1.2 Lint passes: `npm run lint` — a02cb5c
- [x] 1.3 Build passes: `npm run build` — a02cb5c

#### Manual

- [x] 1.4 Today's date accepted in all three forms (no regression) — a02cb5c
- [x] 1.5 Date beyond the one-day grace window rejected in all three forms — a02cb5c
