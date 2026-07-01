---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-dev-body-metrics
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo builder shipping a training/body-metrics/calorie tracker in 3 after-hours weeks needs auth, a relational database, and a fast path to first deploy without assembling the pieces by hand. 10x Astro Starter is the recommended default for `(web-app, js)` and clears all four agent-friendly gates: TypeScript throughout, Supabase gives Postgres plus auth plus storage out of the box (matching FR-001's email+password requirement and the guardrail that data must stay private per account), and Cloudflare Pages is the starter's native deploy target. AI-driven coaching is explicitly a non-goal for this MVP, so no AI feature flag is set. Payments, realtime, and background jobs are all out of scope per the PRD. CI runs on GitHub Actions with auto-deploy-on-merge, matching the solo/small-team default.
