---
change_id: create-and-manage-training-plan
title: Create, view, edit, and delete exercises in a training plan
status: new
created: 2026-07-03
updated: 2026-07-03
archived_at: null
---

## Notes

Resolved from roadmap item S-01 (`context/foundation/roadmap.md`).

- **Outcome:** User can create a training plan and view, edit, and delete exercises in it.
- **PRD refs:** FR-002, FR-003
- **Prerequisites:** F-01 (`training-plan-data-foundation`) — Supabase schema + RLS pattern for plans/exercises. Per roadmap Backlog Handoff, S-01 is **not yet ready for `/10x-plan`** until F-01 lands.
- **Risk (from roadmap):** Free-text exercise entry (no shared library) risks typos/duplicate names — PRD accepts this risk explicitly for v1; do not over-build validation here given the `speed` goal.
- **GitHub issue:** [#9](https://github.com/Julka768/10xdevs/issues/9)
