# Log Weekly Body Measurements — Plan Brief

> Full plan: `context/changes/log-weekly-measurements/plan.md`

## What & Why

Let a user log body measurements — weight plus optional waist/chest/hips/arms/thighs circumferences — on a self-paced weekly cadence. This closes FR-007 and is the last data-producing prerequisite the future weekly report (S-06/FR-008) needs before it can show measurement deltas.

## Starting Point

Three domain-logging slices already exist and set the pattern: `calorie_logs` (full-CRUD, single required field, no cadence enforcement), `body_composition_goals` (append-only, single enum), `workout_logs` (full-CRUD, multiple required fields). `calorie_logs` is the closest analog. No date/week-boundary helper exists anywhere in the codebase — every date-aware table so far stores a plain `logged_at date` and groups history by exact date string.

## Desired End State

From `/dashboard`, a user sees a "latest measurement" teaser and a nav link into `/dashboard/measurements`, where they can log a new entry (weight required, everything else optional), see their full history grouped by date, and edit or delete any of their own entries — with cross-user isolation enforced by RLS.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Fields tracked | Weight (required) + waist/chest/hips/arms/thighs (optional) | User wants the full circumference set but with freedom to skip any on a given entry | Plan (user answer) |
| Cadence enforcement | None — matches `calorie_logs` | Zero new logic, "weekly" stays a usage convention not a DB rule | Plan (user answer) |
| CRUD permissions | Full create/edit/delete | Typos are more likely across 6 numeric fields than 1; matches `calorie_logs` precedent | Plan (user answer) |
| Date representation | Plain `logged_at date`, no week-bucketing | No week logic exists anywhere yet; deferred to the not-yet-built S-06 | Plan (user answer) |
| Units | Metric only (kg/cm), no selector | Matches the app's total absence of i18n/unit handling elsewhere | Plan (user answer) |
| Dashboard hub | Add a "latest measurement" teaser card | Mirrors the existing goal teaser already on `dashboard.astro` | Plan (user answer) |
| Blank optional field on edit | Resolves to explicit `null`, not omitted key | First form in the app with optional fields — omitting the key would silently fail to clear a previously-set value on UPDATE | Plan |

## Scope

**In scope:**
- `body_measurements` table (RLS + GRANT, matching the established pattern)
- Create/update/delete API routes, FormData-based
- `/dashboard/measurements` page (form + grouped history + inline edit/delete)
- Nav link + "latest measurement" teaser on `dashboard.astro`

**Out of scope:**
- Weekly cadence enforcement or reminders
- Week-boundary/ISO-week bucketing logic (`date-utils.ts`) — deferred to S-06
- Unit conversion / imperial support
- User-defined custom fields
- Pagination on history

## Architecture / Approach

Exact structural replication of the `calorie_logs` slice (migration → validation/API → UI), with two deltas: five of six numeric fields are optional (requiring the null-vs-omitted handling described above), and the dashboard hub gains one more query + teaser line, following the existing goal-teaser pattern.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data foundation | `body_measurements` migration (schema/RLS/GRANT) + `database.types.ts` entry, correctly alphabetized | Repeating the alphabetization slip flagged in the prior slice's impl-review |
| 2. API routes | Create/update/delete routes + validation schema with null-clearing optional fields | Blank-field edits silently not clearing a previously-set value |
| 3. UI | Measurements page, nav link, dashboard teaser | None significant — direct pattern reuse |

**Prerequisites:** None — only needs auth, already present.
**Estimated effort:** ~1 session across 3 phases, similar scope to `log-daily-calories`.

## Open Risks & Assumptions

- Assumes `numeric(5,2)` (max 999.99) is sufficient range for weight-in-kg and circumferences-in-cm; not explicitly confirmed with the user but consistent with realistic human measurement ranges.
- No automated test coverage is added, matching the precedent of the two most recent slices; `context/foundation/test-plan.md` §3 has no rollout phase covering this yet.

## Success Criteria (Summary)

- A user can log a weight-only entry or a full six-field entry, and both save correctly.
- Editing to clear an optional field actually clears it (not left stale).
- No user ever sees another user's measurement data, verified manually with two accounts.
