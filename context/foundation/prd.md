---
project: "10xDevBodyMetrics"
version: 1
status: draft
created: 2026-07-01
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Gym-goers who follow a structured training plan currently track their lifting progress, body measurements, and daily calorie intake in separate, single-purpose apps. Logging a workout against their plan, recording a body measurement, or noting a meal each happens in a different tool, so they re-enter context repeatedly and never see training, body change, and diet as one picture — and still have to guess how to adjust their next session's weight or reps without structured guidance.

The insight: training, body metrics, and diet all living in one place already removes the app-juggling cost on its own. An AI trainer that reads a user's logged sets/reps against their own training plan, plus their body-measurement history, and recommends concrete intensity adjustments, is the planned next step that also removes the guesswork — but it is not part of the MVP (see Success Criteria and Non-Goals); v1 proves the unified-tracking value first.

## User & Persona

Primary persona: a gym-goer who follows a structured training plan (created manually within the app) and wants to log workouts against that plan, track body measurements and calories in the same place, and receive AI-driven guidance on how to increase training intensity over time, plus periodic (weekly/bi-weekly/monthly) progress reports.

## Success Criteria

### Primary
- A gym-goer can complete the full loop unaided: sign up, create a training plan, log daily workouts and calories, log weekly body measurements, and view a weekly report comparing their volume/measurements/calories against the prior week and their goal — with all data correctly attributed to their account.

### Secondary
- Users keep logging daily/weekly instead of dropping off after the first session, suggesting the unified tracking is more convenient than their prior multi-app setup.

### Guardrails
- Logged data (workouts, measurements, calories) is never lost or corrupted.
- A user's data is never visible to another user.

## User Stories

### US-01: User logs a workout session against their plan

- **Given** a logged-in user with an existing training plan
- **When** they log a workout session (exercise, weight, reps)
- **Then** the entry is saved and attributed to their account, visible in their own log history only

#### Acceptance Criteria
- Exercise, weight, and reps are all required before the entry saves
- Saved entries are never visible to another account
- The logged entry references an exercise that exists in the user's plan

## Functional Requirements

### Authentication
- FR-001: User can sign up and log in with email + password. Priority: must-have
  > Socrates: Counter-argument considered: "unnecessary for a single-user MVP." Resolution: kept; personal health data plus the privacy guardrail justify real accounts from day one.

### Training plan
- FR-002: User can manually create a training plan (exercises, target sets/reps). Priority: must-have
  > Socrates: Counter-argument considered: "no exercise library risks fragmented data (typos, duplicates)." Resolution: kept as free-text entry for v1; risk accepted, a shared exercise library can be added later.
- FR-003: User can view, edit, and delete exercises in their plan. Priority: must-have
  > Socrates: No counter-argument; stands as written.

### Goals
- FR-004: User can set and edit a body-composition goal (e.g., lose weight, gain weight, maintain) at any time — not locked to onboarding. Priority: must-have
  > Socrates: Counter-argument considered: "locking the goal at onboarding blocks changing it later." Resolution: goal is editable after onboarding, not a one-time setting.

### Logging
- FR-005: User can log a workout session (exercise, weight, reps) against their plan. Priority: must-have
  > Socrates: No counter-argument; stands as written.
- FR-006: User can log calories consumed for a given day. Priority: must-have
  > Socrates: No counter-argument; stands as written.
- FR-007: User can log body measurements (weekly cadence). Priority: must-have
  > Socrates: No counter-argument; stands as written.

### Reporting
- FR-008: User can view a weekly report showing training volume change vs. the prior week, body measurement deltas vs. the prior week, and calorie intake compared against their stated goal. Priority: must-have
  > Socrates: No counter-argument; stands as written.

## Non-Functional Requirements

- A user sees a response to any action within 1 second.
- A user's data (workouts, measurements, calories, goals) is never shared with third parties or exposed to anyone other than the account that created it.

## Business Logic

Each week, the app compares a user's logged training volume and body measurements against the prior week, and their calorie intake against their stated goal, to show whether they're trending toward or away from it.

Inputs: the user's logged workout entries (exercise, weight, reps) and body measurements from the current and prior week, their daily calorie logs for the week, and their currently-set goal (lose weight / gain weight / maintain). Output: a weekly report showing, per exercise, whether training volume moved up, down, or stayed flat versus the prior week; the change in each body measurement versus the prior week; and whether the week's calorie intake aligns with the stated goal. The user encounters this as a report they open at the end of each week, once they've logged at least one full prior week of data to compare against.

## Access Control

Login via email + password. Flat role model — every account has the same capabilities over its own data; no admin/member distinction for the MVP.

## Non-Goals

- No custom/advanced training-recommendation algorithm — recommendations beyond the simple week-over-week comparisons in FR-008 are out of scope.
- No data import from other fitness/nutrition apps — all entry is manual for v1.
- No sharing of training plans or logs between users — everything stays private to the account that created it.
- No integrations with other platforms (wearables, third-party APIs) for v1.
- No native mobile app for v1 — web only.
- No feature for a live human trainer to have visibility into or manage a user's account.
- No AI-generated coaching or report narrative — the weekly report (FR-008) is computed comparisons only; AI-driven suggestions and AI-written reports are planned post-MVP.

## Open Questions

None — the closing quality cross-check in shape-notes.md (Access Control, Business Logic, Timeline-cost acknowledgment, Non-Goals) found no gaps requiring resolution before downstream tech-stack selection.
