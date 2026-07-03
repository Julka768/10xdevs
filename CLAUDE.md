# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime via Wrangler)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (`prettier-plugin-astro` + `prettier-plugin-tailwindcss`)
- No test suite exists yet.
- Pre-commit (husky + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## Architecture

Astro 6 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui ("new-york" style, `components.json`), deployed to Cloudflare Workers via Wrangler. API routes must export `const prerender = false` if they opt out of the default server rendering.

### Auth flow

- `src/lib/supabase.ts` builds a per-request Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `SUPABASE_URL`/`SUPABASE_KEY` (declared as server-only secrets in `astro.config.mjs`'s `env.schema`, read via `astro:env/server`) — it returns `null` when those aren't set, so every caller (`src/middleware.ts`, `src/pages/api/auth/*.ts`) has to handle the unconfigured case.
- `src/middleware.ts` resolves the user on every request into `context.locals.user` and redirects unauthenticated requests away from `PROTECTED_ROUTES` (currently just `["/dashboard"]`).
- The auth API routes (`src/pages/api/auth/{signin,signup,signout}.ts`) are form-POST handlers, not JSON endpoints — they read `FormData` and respond with redirects (`/` on success, `?error=<message>` on failure), not response bodies.
- `src/lib/config-status.ts` centralizes "is Supabase configured" checks so the UI (`Banner.astro`/`Topbar.astro`) can show a setup notice instead of the app failing outright.

### Conventions

- Path alias `@/*` → `./src/*`.
- Astro components for static/layout content; React only for interactive islands (see `src/components/auth/`).
- Use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names instead of concatenating strings.
- New shadcn/ui components: `npx shadcn@latest add [name]` (lands in `src/components/ui/`).
- API routes use uppercase HTTP-method exports (`POST`, etc.); validate non-form-body input with zod going forward (not yet used in the existing form-based auth routes).
- Supabase migrations (none exist yet) go in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`; every new table needs RLS with granular per-operation, per-role policies.
- Env vars come from `.env` (Node/local Supabase CLI) or `.dev.vars` (Cloudflare local dev, gitignored) — both copied from `.env.example`.

### Product context

MVP for a workout/body-metrics/calorie tracker — see `context/foundation/prd.md` for the full spec. Only auth (sign up/in/out) and the protected `/dashboard` shell exist so far; training plans, workout/measurement/calorie logging, and the weekly report (FR-002 through FR-008) are not yet built.

### CI

`.github/workflows/ci.yml` runs lint + build on push/PR to `master`; needs `SUPABASE_URL`/`SUPABASE_KEY` as repo secrets.

## Working with the 10x-cli tool itself

Two additional skills (`10x-cli-guide`, `10x-cli-setup`, symlinked under `.agents/skills/`) cover installing/using the `10x` CLI directly — not this project's own code:

- `10x get <ref>` fetches a lesson bundle (e.g. `10x get m1l1`) and writes skills/prompts/rules/config to tool-specific paths. For Claude Code: skills → `.claude/skills/<name>/SKILL.md`, prompts → `.claude/prompts/<name>.md`, rules → `CLAUDE.md` (this file), config templates → `.claude/config-templates/<name>`.
- `10x list [module]`, `10x doctor [--json]`, `10x auth [--status|--logout]` — browsing, diagnostics, and session management. Auth is interactive (magic-link email); run manually with `! 10x auth --email you@example.com` if the shell can't prompt.
- Re-applying a lesson overwrites skills/prompts if content changed and updates the rules sentinel block, but never touches config templates (may contain user edits).

If you need current CLI command syntax, don't guess from memory — the CLI evolves; the `10x-cli-setup` skill's approach is to fetch the live README from `https://raw.githubusercontent.com/przeprogramowani/10x-cli/refs/heads/master/README.md` rather than hardcode it.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
