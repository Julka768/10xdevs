---
change_id: training-plan-data-foundation
title: Training-plan data foundation
status: implementing
created: 2026-07-03
updated: 2026-07-03
archived_at: null
---

## Notes

Resolved from roadmap item F-01 (`context/foundation/roadmap.md`).

- **Outcome:** (foundation) Minimal Supabase schema for training plans and exercises, with the RLS (row-level security) policy pattern established — free-text exercise entry per PRD's accepted risk (no shared exercise library for v1).
- **PRD refs:** FR-002, FR-003
- **Unlocks:** S-01 (`create-and-manage-training-plan`) and establishes the RLS pattern every later slice's own tables (workout logs, goals, calories, measurements) will replicate.
- **Prerequisites:** — (Supabase project already provisioned; auth baseline confirms connectivity)
- **Risk (from roadmap):** The table shape and RLS policy chosen here become the template for five more domain tables — getting the policy shape right once here avoids rework across every later slice.
- **GitHub issue:** [#8](https://github.com/Julka768/10xdevs/issues/8)
