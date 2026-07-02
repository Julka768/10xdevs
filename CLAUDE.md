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

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
