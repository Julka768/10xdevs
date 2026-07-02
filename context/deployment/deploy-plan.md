# First deployment: 10x-dev-body-metrics → Cloudflare Workers

## Context

`context/foundation/infrastructure.md` already picked Cloudflare Workers/Pages as the deployment platform (zero-migration cost — the project is bootstrapped with `@astrojs/cloudflare` + Wrangler). This plan is the deploy step of the infra chain: turn that decision into the actual first production deployment, with a human gate before anything touches Cloudflare or GitHub secrets.

Research findings from reading the repo directly:

- **This is a Workers deployment, not literal "Cloudflare Pages".** `wrangler.jsonc` is configured with `main: "@astrojs/cloudflare/entrypoints/server"` and a `assets` binding — that's the Workers Static Assets model (the modern successor to Pages for this adapter). Deploys go through `wrangler deploy`, **not** `wrangler pages deploy`. `tech-stack.md`'s `deployment_target: cloudflare-pages` hint is a label carried from bootstrap time; the actual wired command is Workers-native. This matches the "Unknown Unknown" already flagged in `infrastructure.md` about Pages vs. Workers parity.
- **The CI deploy job already exists but is uncommitted.** `.github/workflows/ci.yml` has a working-tree diff adding a `deploy` job (gated on `push` to `master`, needs the `ci` job first) that runs `npm ci && npm run build` then `cloudflare/wrangler-action@v3` with `command: deploy`. This is exactly the `auto-deploy-on-merge` flow `tech-stack.md` calls for.
- **A related risk-mitigation is already uncommitted too.** `src/pages/auth/confirm-email.astro` now has `export const prerender = true`, which is the exact fix `infrastructure.md`'s risk register calls for ("static routes missing `prerender = true` invoke the Worker unnecessarily").
- **Version note in `infrastructure.md` is stale.** Its "Getting Started" says `@astrojs/cloudflare` "v14.0.1 per current research" — `package.json` actually pins `^13.5.0`, and `wrangler` is already a devDependency at `^4.90.0`. No version bump is needed for this deploy; the plan uses the versions actually installed.
- **Local Node is v20.9.0; Wrangler requires Node ≥22 — verified, not assumed.** `npx wrangler whoami` failed immediately with a Node-version message (not an auth failure). Checked further: `node_modules` isn't installed in this worktree, and `npm view wrangler@4.90.0 engines` returns `{ node: '>=22.0.0' }` — the pinned version genuinely declares this as a hard engine requirement, not a soft recommendation. CI already runs Node 22, so the CI deploy path is unaffected — but any *local* Wrangler command (`login`, `secret put`, `tail`, manual `deploy`) needs Node upgraded first.
- **`.env.example` lists `SUPABASE_URL` / `SUPABASE_KEY`.** No `.dev.vars` present locally (expected — gitignored, local-only). Both are declared `optional: true` in `astro.config.mjs`, so a build without them won't fail, but the app won't work at runtime without them pushed as Worker secrets.
- **GitHub remote is `Julka768/10xdevs`.** `gh` CLI isn't available in this shell, so I could not check which repo secrets already exist — that has to be verified by the user directly on GitHub.

## What I will do (automated, once approved) — edits only, no git actions

1. Leave the two already-present working-tree changes as-is (I won't touch them further, just point them out for your review):
   - `.github/workflows/ci.yml` — adds the `deploy` job.
   - `src/pages/auth/confirm-email.astro` — adds `export const prerender = true`.
2. Add a `"deploy": "wrangler deploy"` script to `package.json` for a documented one-liner matching the CI command (small, low-risk convenience addition).
3. Fix the stale version note in `context/foundation/infrastructure.md`'s "Getting Started" step 1 to reflect the actual pinned `@astrojs/cloudflare` version (`^13.5.0`) instead of the incorrect "v14.0.1".
4. After making edits 2–3, run `git diff` and show you every changed file so you can review before anything is staged.

I will **not** run `git add`, `git commit`, `git push`, open a PR, or run `wrangler deploy` / `wrangler login` / `wrangler secret put` — all committing, pushing, and any Cloudflare-touching command are yours to run. This also sidesteps my local Node v20.9.0, which can't run Wrangler anyway.

## Manual gates (you run these — I can't do them for you)

1. **Confirm Cloudflare account + note the Account ID** (Dashboard right sidebar, or `wrangler whoami` after a Node upgrade).
2. **Create a scoped Cloudflare API token**: Workers Scripts → Edit, scoped to this one Worker/account — no DNS, no other-project Workers Secrets, no billing (per the minimal-permissions posture in `infrastructure.md`).
3. **Add 4 repo secrets** on `Julka768/10xdevs` → Settings → Secrets and variables → Actions:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   (Verify none of these already exist with stale values before adding.)
4. **Push Supabase secrets to the Worker itself** (separate from the CI build-time env vars above — Astro reads these via `astro:env/server` from the Workers runtime, not from `process.env`):
   ```
   npx wrangler login
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Requires Node ≥22 locally (nvm/volta) since your current Node is v20.9.0.
5. **Review the diffs, then commit, push, and merge to `master` yourself** (directly or via PR, your call) — this merge is what actually triggers the first production deploy via the CI `deploy` job.

## Exact deploy path

- **Primary (matches `tech-stack.md`'s `auto-deploy-on-merge`)**: merge to `master` → `ci` job (lint + build) → `deploy` job → `cloudflare/wrangler-action@v3` runs `wrangler deploy` (Workers deploy — confirmed by `wrangler.jsonc`, not `wrangler pages deploy`).
- **Manual one-off fallback** (after Node upgrade): `npm run build && npx wrangler deploy`.

## Verification (after merge)

1. Watch the GitHub Actions run on `master` go green (`ci` then `deploy`).
2. `npx wrangler deployments list` — confirm a new deployment landed.
3. `npx wrangler tail` while opening the deployed `*.workers.dev` URL — watch for `nodejs_compat` runtime errors or cold-start timeouts on first real traffic (the top risk in `infrastructure.md`'s risk register).
4. Exercise the sign-up/sign-in flow end-to-end in the deployed app — this is the concrete proof the `wrangler secret put` step actually wired Supabase correctly at runtime (a green build does not prove this, since the env vars are optional at build time).
5. Confirm an unauthenticated request to `/dashboard` redirects correctly in production (validates `middleware.ts` behavior under the real Workers runtime, not just `astro dev`).
