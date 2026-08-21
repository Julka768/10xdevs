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

## 10xDevs AI Toolkit - Module 3, Lesson 3

Lesson 3 is about **hooks** — turning the quality gates from Lesson 1 and the tests from Lesson 2 into automatic, deterministic checks that fire while the agent works. A hook runs outside the model, so it survives context compression, instruction changes, and the model "forgetting". The payoff for agentic hooks specifically: a `PostToolUse` check can feed its result back into the agent's context, so the agent fixes trivial errors (formatting, a missing import, a wrong type) on its own in the next iteration instead of you discovering them minutes later.

```
context/foundation/test-plan.md  (§4 Quality Gates: which check, required when)
        │
        ▼  (assign each gate to the cheapest layer that still gives signal)
   per-edit (agent hooks)  →  pre-commit (git hooks)  →  pre-push  →  CI
        │ lint, format, scoped tests          │ staged       │ heavier    │ integration
        ▼
   exit code + stdout  →  additionalContext  →  agent reacts next turn
```

### Task Router — Which layer for this check

| You want to | Do this |
| --- | --- |
| React the instant the agent edits a file | A per-edit hook (`PostToolUse` matcher `Write\|Edit` in Claude Code). Right for fast checks: lint/format, and scoped tests on risk-area files. This is the **only** layer that can hand feedback to the agent mid-session. |
| Run only the tests that depend on the edited file | Parse the path from the hook's stdin (`jq -r .tool_input.file_path`) and run your runner's related-tests mode (`vitest related "$FILE" --run`, `jest --findRelatedTests $FILE`). Gate it on whether the file is a risk area in `test-plan.md`; don't run tests on every helper or config edit. |
| Catch changes that bypassed the agent (manual edits, a teammate's commit) | A pre-commit git hook (Lefthook or Husky+lint-staged) over staged files: lint + typecheck, and tests on staged risk files. |
| Run heavier checks before code leaves the machine | Pre-push: full typecheck or a broader test set. Anything too slow for per-edit moves here. |
| Decide where a given gate belongs | Ask: is it fast enough (a few seconds) for per-edit, or should it wait for commit/push/CI? Slow checks block the agent loop on every edit — push them up a layer. |
| Use the same hook across tools | The trigger → matcher → handler → signal pattern is the same in Cursor, Codex, Windsurf, and Copilot; only the config file and event names change. See the cross-tool table below. |

### Hook lifecycle — the universal pattern

Every tool's hooks follow four steps:

1. **Trigger** — an event in the tool (e.g. the agent just saved a file: `PostToolUse`).
2. **Matcher** — a filter deciding whether this hook runs (tool name like `Write`/`Edit`, file type, or a name pattern).
3. **Handler** — the action that runs, usually a shell command.
4. **Signal** — the result returns to the tool. The exit code says pass/fail; stdout can flow into the agent's context as feedback.

### Exit codes and the feedback loop

- **0** — success; the hook passed, continue.
- **2** — blocking error; the agent sees the feedback and should react.
- **anything else** — non-blocking error; logged, but does not interrupt work.

On a blocking failure, stdout flows into the agent's context (in Claude Code via `additionalContext`, capped at 10,000 characters; other tools have similar mechanisms with their own limits). That is why the agent can self-correct: it sees the concrete message — missing type, unimported module, badly formatted line — not just "something failed".

The boundary: the agent reliably fixes **trivial** corrections on its own. When a test fails because of wrong business logic, the hook surfaces it but the agent may not diagnose the real cause — it says "something is off" and tries a trivial fix. If that does not resolve in one or two tries, the signal comes back to you, and the problem may deserve its own change-id with the full `/10x-new → /10x-research → /10x-plan → /10x-implement` workflow.

### Three local layers (plus CI)

| Layer | Catches | Timing |
| --- | --- | --- |
| Per-edit (agent hooks) | Formatting, simple type errors, failing unit tests on risk files. Only layer that feeds the agent mid-work. | ms–s |
| Pre-commit (git hooks) | What slipped past per-edit: manual edits, files changed outside the hook, checks too slow for per-edit. Operates on staged files. | s |
| Pre-push | Heavier checks before pushing to remote (full typecheck, broader test set). | s–min |
| CI | Integration problems, cross-module dependencies, checks needing infra unavailable locally. | min |

Local layers do **not** replace CI — CI stays the key verification for shared repo state and environments you don't control. But each local layer that catches an error is one fewer CI round-trip. You don't need all layers from day one: start with one per-edit hook (lint) and one commit gate, add layers as you see what escapes. The quality gates in `test-plan.md §4` decide which checks are worth automating and when; a plan may legitimately defer per-edit hooks if the cost/signal ratio isn't there yet.

### Key rules

- Keep per-edit hooks fast. If a check takes more than a few seconds, move it to commit, push, or CI — a slow per-edit hook blocks the agent loop on every edit. Lint/format are ideal per-edit; full typecheck is often a commit gate in larger projects.
- Run scoped tests, not the whole suite, per edit — only tests related to the edited file, and only when that file is a risk area in `test-plan.md`.
- `related` is a subcommand, not a flag (`vitest related`, not `--related`). Use `--run` so the hook terminates instead of entering watch mode.
- `PostToolUse` fires once per tool use; three edits in one turn fire it three times independently — there is no built-in aggregation.
- The git hook tool (Lefthook vs Husky+lint-staged) is an implementation detail; the rule is the same — run checks on staged files before commit. If Husky already works, don't migrate.
- **Context injection is not universal.** Claude Code, Cursor, Codex, and Copilot (in VS Code) can pass a hook's result to the agent; Windsurf cannot — it can block (exit 2) but can't tell the agent what went wrong.

### The same pattern in every tool

| Tool | Events | Handlers | Context injection | Config |
| --- | --- | --- | --- | --- |
| Claude Code | ~30 | command, http, mcp_tool, prompt, agent | yes | `.claude/settings.json` |
| Cursor | ~18 | command, prompt | yes | `.cursor/hooks.json` |
| Codex | 10 | command | yes | `.codex/hooks.json` |
| Windsurf | 12 | command | **no** | `.windsurf/hooks.json` |
| Copilot | ~13 | command, http, prompt | yes (VS Code) | `.github/hooks/*.json` |

### Lesson boundaries

- This lesson configures hooks and local quality layers only. The hook JSON, `lefthook.yml`, and the per-edit/commit/push layering are the scope.
- Do not write E2E tests, configure Playwright/MCP, or run browser scenarios. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test debugging workflow. That is Lesson 5.
- Do not change the risk strategy or quality-gate definitions. That is Lesson 1 (`/10x-test-plan`); read current state with `/10x-test-plan --status`.
- Do not write unit/integration test code from scratch here. That is Lesson 2 — hooks only *run* the tests those lessons produced.
- Do not author CI/CD pipelines. That is Module 1 Lesson 5 / Module 2 Lesson 5; hooks are the local layers in front of CI.

### Paths used by this lesson

- `.claude/settings.json` — hook configuration (`~/.claude/settings.json` global, `.claude/settings.json` project, `.claude/settings.local.json` local overrides). Other tools use their own config file (see the table).
- `lefthook.yml` — pre-commit git hook config (lint + typecheck + tests on `{staged_files}`).
- `context/foundation/test-plan.md` — §4 quality gates decide which checks to automate and at which layer; risk areas decide which edits warrant scoped tests.

<!-- END @przeprogramowani/10x-cli -->
