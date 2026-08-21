# Set Body-Composition Goal — Plan Brief

> Full plan: `context/changes/set-body-composition-goal/plan.md`

## What & Why

Let a logged-in user set and edit a body-composition goal (lose / gain / maintain weight) at any time (FR-004). This is roadmap slice S-03 — a small, self-contained entity with no dependency on the training-plan domain, but the first slice in this codebase to model "one current value per user" rather than a list.

## Starting Point

`training_plans`, `exercises`, and `workout_logs` exist with the same migration → API route → Astro page pattern, but all three are lists (multiple rows meaningfully coexist per user). No goal table, route, or page exists yet, and `dashboard.astro` is a minimal shell with no Supabase query today.

## Desired End State

A user visits `/dashboard/goal`, sees their current goal (or an empty-state prompt if none is set), and can set or change it via a simple form. The dashboard shell also shows the current goal at a glance with a link to the goal page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data model | Append-only history table, no unique constraint on `user_id` | Full history of goal changes is preserved for free; "current" = latest row by `created_at` |
| Write path | Always plain `insert`, never `update`/`upsert` | Consistent with the append-only model — no row is ever mutated after creation |
| RLS surface | Only `select`/`insert` policies; no `update`/`delete` policies or GRANTs | Matches the "never mutate a row" design; default-deny covers the operations that should never happen |
| Initial state | No default goal — nullable until the user acts | A silent default (e.g. "maintain") could produce a misleading FR-008 comparison the user never confirmed |
| UI placement | Dedicated `/dashboard/goal` page | Keeps the deliberately-minimal dashboard shell clean, mirrors the `plans/` subtree pattern |
| Edit UX | Read-only view + "Edit" link via `?edit=` query param | Mirrors the existing exercises edit-toggle pattern already used in this codebase |
| Empty state | Form with nothing pre-selected + "No goal set yet" message | Natural consequence of the nullable-default decision — no hidden suggested value |
| Visibility scope | Also shown on the `dashboard.astro` shell, not just the goal page | User sees their goal at a glance right after login |

## Scope

**In scope:**
- `body_composition_goals` table (append-only) + RLS (select/insert only) + GRANTs + index
- Single insert API route + zod schema
- `/dashboard/goal` page (empty state / view+edit) and a current-goal display on `dashboard.astro`

**Out of scope:**
- Target-weight or magnitude field — direction only (lose/gain/maintain)
- A UI to browse the full goal-change history
- Any update/delete of goal rows
- Rate limiting on how often the goal can change
- Changes to `Topbar.astro`

## Architecture / Approach

Same three-layer pattern as prior slices (migration → form-POST API route → Astro UI), but modeled as an append-only log rather than a CRUD list: no unique constraint, no update/delete policies, "current" is always a derived latest-row query used identically at both read sites (goal page and dashboard shell).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data foundation | `body_composition_goals` table, RLS (select/insert only), GRANTs, index | Getting select/insert-only RLS right from the start — no update/delete policy should exist |
| 2. API route | Single insert route + zod validation | None significant — smallest route shape in the app so far (one field) |
| 3. UI | Goal page (empty state / view+edit) + dashboard shell display | No shadcn select/radio component exists yet — uses plain native HTML inputs |

**Prerequisites:** None — self-contained, no dependency on other domain data.
**Estimated effort:** ~1 session across 3 phases, smaller than S-01/S-02.

## Open Risks & Assumptions

- Assumes three fixed enum values (`lose`/`gain`/`maintain`) are sufficient forever — any future addition (e.g. "recomp") would need both a DB check-constraint migration and a zod schema update.
- The goal-change history table has no consumer yet in this slice; S-06 (weekly report) will need its own query against it, not a shared helper, since none exists.

## Success Criteria (Summary)

- A user can set a body-composition goal and see it reflected immediately on both the goal page and the dashboard shell.
- A user can change their goal at any time without restriction, and the change is reflected as the new current value.
- Goal data is never visible to another account (RLS-enforced).
