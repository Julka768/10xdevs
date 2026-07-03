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

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
