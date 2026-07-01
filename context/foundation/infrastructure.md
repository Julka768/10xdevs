---
project: 10x-dev-body-metrics
researched_at: 2026-07-01
recommended_platform: Cloudflare Workers/Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro 6 (SSR, `output: "server"`) with React 19 islands
  runtime: Cloudflare Workers (via `@astrojs/cloudflare`, Wrangler CLI)
---

## Recommendation

**Deploy on Cloudflare Workers/Pages.**

The project is already bootstrapped with the `@astrojs/cloudflare` adapter and Wrangler CLI (`tech-stack.md` pins `deployment_target: cloudflare-pages`), so this is a zero-migration-cost path, not a fresh pick. Cloudflare also scored highest on the platform comparison (4 Pass / 1 Partial) and matches every interview constraint: no persistent-connection requirement, single-region traffic is fine, external Supabase/OpenRouter make co-located services irrelevant, and the developer already has hands-on Cloudflare familiarity.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers/Pages | Pass | Pass | Pass | Pass | Partial | 4P/1Pt |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4P/1Pt |
| Netlify | Partial | Pass | Pass | Partial | Pass | 3P/2Pt |
| Railway | Partial | Pass | Pass | Partial | Pass | 3P/2Pt |
| Render | Partial | Pass | Pass | Pass | Partial | 3P/2Pt |
| Fly.io | Partial | Pass | Pass | Partial | Partial | 2P/3Pt |

Notes per platform:

- **Cloudflare Workers/Pages**: `wrangler deploy` / `wrangler rollback` / `wrangler tail` / `wrangler secret` are all GA and fully scriptable. `llms.txt`/`llms-full.txt` are published and current. The one gap is the Workers Observability MCP server, explicitly flagged "still a work in progress" (checked April 2026 docs) — a docs/bindings MCP catalog exists alongside it, so MCP coverage isn't absent, just uneven.
- **Vercel**: Equally strong CLI (`vercel deploy` / `rollback` / `logs`), full Node.js runtime (no compat-flag caveats), and `llms-full.txt` agent docs. Vercel MCP is public beta, read-only initially. Would require swapping the Astro adapter from `@astrojs/cloudflare` to `@astrojs/vercel`.
- **Netlify**: Official MCP server is GA (ahead of Cloudflare/Vercel here), and `@astrojs/netlify` is GA, but rollback is dashboard-driven ("Publish Deploy") with no dedicated CLI rollback subcommand — a real gap for unattended agent operation. Also requires an adapter swap.
- **Railway**: Official MCP server is GA, but Railway's own Astro guide notes Railpack auto-builds Astro as a **static site by default** — SSR requires explicitly following a separate SSR guide, a real footgun for this stack. Railpack itself is still labeled beta.
- **Render**: Deploy hooks + rollback API are solid and deterministic, but the CLI is thinner than competitors (most complex operations route through dashboard/API). Its MCP server is GA per docs but scoped to create/read/env-update only — it cannot modify or delete existing resources.
- **Fly.io**: Best-in-class for persistent connections/WebSockets (not needed here), but that strength is irrelevant to this project and comes with the most operational overhead (Dockerfile, `fly.toml`, machine sizing) of any candidate — the wrong trade for a 3-week solo MVP with no persistent-connection requirement. Its MCP integration is explicitly labeled "experimental."

### Shortlisted Platforms

#### 1. Cloudflare Workers/Pages (Recommended)

Already the bootstrapped adapter and CLI — no migration cost. Top score on the comparison, generous free tier (100k requests/day, comfortably covers 10k–100k/month), and matches every interview answer (no persistent connections, single region fine, external DB/AI services, existing familiarity).

#### 2. Vercel

Ties Cloudflare on raw score and has a more mature, full-Node-parity serverless runtime with no compat-flag caveats — the strongest fallback if a Cloudflare-specific blocker (e.g., a Node API `nodejs_compat` doesn't cover) ever forces a swap. The cost is losing the zero-migration advantage and giving up the adapter/tooling already in place.

#### 3. Netlify

Netlify's official MCP server is GA today, ahead of Cloudflare's WIP observability MCP — a genuine edge if agent-driven production operations become a priority. Held back by CLI-only-partial rollback (dashboard-driven) and, like Vercel, requires an adapter swap from the current Cloudflare setup.

## Anti-Bias Cross-Check: Cloudflare Workers/Pages

### Devil's Advocate — Weaknesses

1. **Node.js compatibility is partial, not full.** `nodejs_compat` polyfills common APIs but doesn't give full Node parity — any dependency (Supabase client internals, a future OpenRouter SDK) touching an unsupported Node API fails at deploy/runtime, not at code-review time, often as an opaque Workers runtime error.
2. **A documented regression already happened.** Astro 6 + `@astrojs/cloudflare` v13.1.1 had a Node-compat-flag regression reported March 2026 — the adapter/runtime pairing is still maturing post-Astro-acquisition; version pinning matters more here than on more mature adapters.
3. **Cold-start budget is tight and easy to blow.** Workers enforce a ~1s CPU init budget on the global scope; growing imports (shadcn components, Supabase SDK, future AI SDK) can silently push past this with no local warning, since `astro dev` doesn't run under `workerd`.
4. **`wrangler dev` vs `astro dev` split creates a blind spot.** Cloudflare-specific bindings and runtime behavior only surface under `wrangler dev` — a solo dev iterating mostly in `astro dev` may only discover platform-specific issues right before deploy.
5. **Platform incentive alignment is a soft risk.** Cloudflare acquired Astro's maintainer (The Astro Technology Company) in January 2026 — currently neutral-to-positive (faster fixes, deeper integration), but it makes Astro's cross-cloud neutrality dependent on one vendor's continued goodwill.

### Pre-Mortem — How This Could Fail

Six months in, the team hit two compounding problems. First, a minor dependency bump (a Supabase client patch) pulled in a transitive package using a Node API `nodejs_compat` didn't fully polyfill — it worked locally under `astro dev` and even under `npm run build`, but failed only in the deployed Worker, costing a full day of bisecting because the error surfaced as an opaque runtime exception with no local repro path. Second, as the app grew (weekly report computation, more UI islands), global-scope initialization crept past the 1s CPU budget; requests started intermittently timing out under real traffic that `wrangler dev` hadn't exercised. Nobody had budgeted time to profile cold-start cost because the free tier's generous request quota created false confidence that "it just works." The fixes were straightforward in hindsight (lazy-load heavy imports, pin the adapter version, always test via `wrangler dev` before deploy) — but discovering them mid-incident, after a real user hit a broken weekly report, is what made it feel like a disaster.

### Unknown Unknowns

- Static pages need `export const prerender = true` explicitly, or every request — including ones servable as static assets — invokes the Worker unnecessarily, eating into the CPU-time budget and request count.
- Workers secrets are pushed via `wrangler secret put`, not read from a `.env` file at runtime — a workflow mismatch for anyone used to Node-style env loading.
- The Workers Observability MCP server is explicitly flagged "still a work in progress" — if the plan is to let an agent monitor production logs/metrics via MCP rather than `wrangler tail`, that path isn't stable yet.
- Pages is not deprecated, but new Cloudflare capability work now lands on Workers first — since `tech-stack.md` pins `deployment_target: cloudflare-pages` specifically, watch for feature parity gaps and the option to migrate to Workers-native static-asset serving if needed (Cloudflare publishes a Pages→Workers migration guide).

**Decision**: proceed with Cloudflare Workers/Pages — risks noted and captured in the risk register below.

## Operational Story

- **Preview deploys**: Wrangler supports preview URLs per deployment via `wrangler versions upload` / preview aliases; combine with the existing GitHub Actions CI (`ci_default_flow: auto-deploy-on-merge` per `tech-stack.md`) to gate production publish behind PR review.
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` and any future OpenRouter key are declared as server-only secrets in `astro.config.mjs`'s `env.schema` (read via `astro:env/server`) and pushed to the Worker with `wrangler secret put <NAME>` — never committed to `.env` in production; local dev uses `.dev.vars` (already gitignored per `CLAUDE.md`).
- **Rollback**: `wrangler rollback [version_id]` reverts to a prior deployed version in one command (defaults to the immediately-previous version if no ID given); no database migration rollback is automatic — Supabase migrations are a separate, manual revert if a schema change shipped alongside a bad deploy.
- **Approval**: A human must approve any production `wrangler deploy` merge to `master` (already gated by the existing CI workflow) and any secret rotation (`wrangler secret put`). An agent may run `wrangler tail`, `wrangler deployments list`, read-only Workers Observability MCP tools (where stable), and preview deploys unattended.
- **Logs**: `wrangler tail` streams live production logs and exceptions; `wrangler deployments list` shows deployment history for auditing. The Workers Observability MCP server offers structured log/metric access but is still WIP — treat `wrangler tail` as the primary agent-accessible logging path for now.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| A dependency uses a Node API not covered by `nodejs_compat`, breaking only in production | Devil's advocate / Pre-mortem | M | M | Test every new dependency via `wrangler dev` (not just `astro dev`) before merging; watch Workers runtime errors on first deploy of new deps |
| Adapter/runtime regression on an Astro or `@astrojs/cloudflare` version bump (precedent: March 2026 regression) | Devil's advocate / Research finding | M | M | Pin `astro` and `@astrojs/cloudflare` versions; review adapter changelog before bumping either |
| Global-scope init creeps past the ~1s CPU cold-start budget as the app grows | Devil's advocate / Pre-mortem | M | H | Lazy-load heavy imports (Supabase SDK, future AI SDK); periodically check cold-start time via `wrangler dev` / production logs |
| Local dev (`astro dev`) hides Cloudflare-specific runtime/binding behavior until deploy | Devil's advocate | M | M | Run `wrangler dev` before every deploy, not just `astro dev`, especially after touching env/secret access or bindings |
| Workers Observability MCP server is WIP — agent-driven production monitoring isn't a stable interface yet | Unknown unknowns / Research finding | H (current state) | L | Use `wrangler tail` and `wrangler deployments list` as the primary agent-accessible logging path until the MCP server reaches GA |
| Static routes missing `export const prerender = true` invoke the Worker unnecessarily, burning CPU/request budget | Unknown unknowns | M | L | Audit routes for correct `prerender` flags during implementation review |
| Cloudflare's January 2026 acquisition of Astro's maintainer creates single-vendor dependency for Astro's Cloudflare integration | Devil's advocate | L | L | No action needed now; monitor Astro's cross-cloud adapter parity if this becomes a concern later |

## Getting Started

1. Confirm the pinned versions in `package.json`: `astro` (6.x) and `@astrojs/cloudflare` (v14.0.1 per current research) — do not bump either without checking the adapter changelog first.
2. Authenticate Wrangler: `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN` for CI).
3. Push secrets to the Worker: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (matching the `env.schema` entries in `astro.config.mjs`).
4. Validate locally under the actual Workers runtime — not just `npm run dev` — with `npx wrangler dev` before the first deploy, to catch `nodejs_compat` gaps early.
5. Deploy with `npm run build && npx wrangler deploy` (or let the existing GitHub Actions `auto-deploy-on-merge` flow handle it on merge to `master`); verify with `npx wrangler tail` immediately after to catch cold-start or runtime errors on first real traffic.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
