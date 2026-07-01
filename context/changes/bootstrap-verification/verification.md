---
bootstrapped_at: 2026-07-01T16:30:08Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10x-dev-body-metrics
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

A solo builder shipping a training/body-metrics/calorie tracker in 3 after-hours weeks needs auth, a relational database, and a fast path to first deploy without assembling the pieces by hand. 10x Astro Starter is the recommended default for `(web-app, js)` and clears all four agent-friendly gates: TypeScript throughout, Supabase gives Postgres plus auth plus storage out of the box (matching FR-001's email+password requirement and the guardrail that data must stay private per account), and Cloudflare Pages is the starter's native deploy target. AI-driven coaching is explicitly a non-goal for this MVP, so no AI feature flag is set. Payments, realtime, and background jobs are all out of scope per the PRD. CI runs on GitHub Actions with auto-deploy-on-merge, matching the solo/small-team default.

## Pre-scaffold verification

| Signal             | Value                                          | Severity | Notes                                          |
| ------------------- | ---------------------------------------------- | -------- | ----------------------------------------------- |
| npm package         | not run                                        | n/a      | `cmd_template` starts with `git clone`; npm-package recency check skipped per spec |
| GitHub repo         | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card `docs_url`; checked via public GitHub REST API (`gh` CLI unavailable in this environment) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 top-level entries (`.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `astro.config.mjs`, `CLAUDE.md`, `components.json`, `eslint.config.js`, `node_modules`, `package.json`, `package-lock.json`, `public`, `README.md`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (existing project CLAUDE.md preserved)
**.gitignore handling**: moved silently (cwd had no pre-existing `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` stripped before move-up)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 6 HIGH, 10 MODERATE, 2 LOW
**Direct vs transitive**: 0/5/3/2 direct of total 0/6/10/2 (CRITICAL/HIGH/MODERATE/LOW) — direct findings are on packages the starter depends on directly; the remainder are transitive (pulled in by those or by devDependencies)

#### CRITICAL findings

None.

#### HIGH findings

- **astro** (direct) — range `<=7.0.0-beta.6`. Advisories: [GHSA-8hv8-536x-4wqp](https://github.com/advisories/GHSA-8hv8-536x-4wqp) "Reflected XSS via unescaped slot name" (high), [GHSA-2pvr-wf23-7pc7](https://github.com/advisories/GHSA-2pvr-wf23-7pc7) "Host header SSRF in prerendered error page fetch" (high). Fix available.
- **devalue** (direct) — range `5.6.3 - 5.8.0`. Advisory: [GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p) "DoS via sparse array deserialization" (high). Fix available.
- **undici** (direct) — range `7.0.0 - 7.27.2`. Advisories include [GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g) "TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent" (high), [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) "WebSocket client DoS via fragment count bypass" (high), [GHSA-hm92-r4w5-c3mj](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) "cross-origin request routing via SOCKS5 proxy pool reuse" (high). Fix available.
- **vite** (direct) — range `7.0.0 - 7.3.3`. Advisory: [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) "`server.fs.deny` bypass on Windows alternate paths" (high). Fix available.
- **ws** (direct) — range `8.0.0 - 8.20.1`. Advisory: [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) "Memory exhaustion DoS from tiny fragments and data chunks" (high). Fix available.
- **miniflare** (transitive, via Cloudflare tooling) — range `<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260616.0`. Fix available.

#### MODERATE findings

- **js-yaml** (direct) — [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) "Quadratic-complexity DoS in merge key handling via repeated aliases". Fix available.
- **tar** (direct) — [GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh) "PAX size override causes tar parser interpretation differential (file smuggling)". Fix available.
- **yaml** (direct) — [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) "Stack Overflow via deeply nested YAML collections". Fix requires a semver-major bump (via `@astrojs/check`).
- **@astrojs/check** (transitive) — range `>=0.9.3`. Fix requires a semver-major bump.
- **@astrojs/language-server** (transitive) — range `>=2.14.0`. Fix requires a semver-major bump.
- **@cloudflare/vite-plugin** (transitive) — range `<=0.0.0-fff677e35 || 0.0.7 - 1.41.0`. Fix available.
- **supabase** (transitive) — range `1.1.6 - 2.98.2`. Fix available.
- **volar-service-yaml** (transitive) — range `<=0.0.70`. Fix requires a semver-major bump.
- **wrangler** (transitive) — range `<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0`. Fix available.
- **yaml-language-server** (transitive) — range varies. Fix requires a semver-major bump.

#### LOW / INFO findings

- **@babel/core** (direct) — [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) "Arbitrary File Read via sourceMappingURL Comment". Fix available.
- **esbuild** (direct) — [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) "Arbitrary file read when running the dev server on Windows". Fix available.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ----------------------------------- |
| bootstrapper_confidence    | first-class                         |
| quality_override           | false                                |
| path_taken                 | standard                            |
| self_check_answers         | null                                 |
| team_size                  | solo                                 |
| deployment_target          | cloudflare-pages                     |
| ci_provider                | github-actions                       |
| ci_default_flow            | auto-deploy-on-merge                 |
| has_auth                   | true                                 |
| has_payments               | false                                |
| has_realtime                | false                                |
| has_ai                      | false                                |
| has_background_jobs         | false                                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (`CLAUDE.md` vs `CLAUDE.md.scaffold` in this run).
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. Given `has_auth: true`, the `undici` (TLS/proxy) and `astro` (XSS/SSRF) HIGH findings are worth prioritizing before shipping auth flows.
