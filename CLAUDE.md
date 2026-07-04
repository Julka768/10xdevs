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

## 10xDevs AI Toolkit - Module 3, Lesson 2

Lesson 2 is about **writing tests that actually protect code** — not just maximise coverage. The oracle problem and vibe-testing anti-patterns explain why LLM-generated tests fail on real code; the risk-first quality contract from Lesson 1 is the fix.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` is an **optional test-first mode**, not a replacement for the chain. It reads the same `plan.md`, writes to the same `## Progress` section, and covers the same phases as `/10x-implement`. Use it only when you can name the first failing assertion before writing any code.

### Task Router — Where to start

| Skill / Prompt | Use it when |
| --- | --- |
| `/10x-research` | Before writing any test for a risk. Research produces the oracle — what behaviour a test must prove — from sources (PRD, tech-stack, docs), not from the implementation shape. Also reveals whether a risk is already covered or has two separate faces (one safe, one real). |
| `/10x-plan` | Research is done. Plan decomposes the risk into ordered phases: environment setup first, then rules that depend on it, then hermetic stubs for failures that real infra cannot trigger, then cookbook update. Each phase names the behaviour it asserts and the regression it catches. |
| `/10x-implement` | Default executor for plan phases. Use for environment setup, existing code, scaffolding, and any phase where you cannot define a red test before writing code. |
| `/10x-tdd` | Optional. Use instead of `/10x-implement` for a phase where you can name the first red test in one sentence. Agent writes the failing test first, then the minimal code to green it, then refactors. Stops at the assertion before touching the implementation — that pause is the point. |
| `m3l2-ad-hoc-testing` prompt | You have a single file and want tests now, without the full research→plan→implement cycle. The prompt forces oracle-from-sources (reads PRD + TECH_STACK before asserting), behavioural assertions, edge cases from risk, and a regression table. Use it knowing you are trading depth for speed. |

### When to use `/10x-tdd` vs `/10x-implement`

The deciding question: *Can you name the first red test in one sentence?*

Good conditions for `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Each of these names an observable outcome, not an internal detail. If you cannot produce a sentence like this, stay on `/10x-implement` or return to `/10x-research`.

`/10x-tdd` is **not suited** for: environment setup, CI/CD config, documentation, thin wiring where the test would just rewrite the implementation, or a spike where you are still discovering the contract.

You can mix both modes in one plan:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Both write progress to the same `## Progress` section in `plan.md`.

### Two-layer test strategy (cost × signal)

For each risk, pick the **cheapest test that gives a real signal**. Do not default to e2e "because it's safest", and do not chase coverage percentage.

| Layer | When to use | When NOT to use |
| --- | --- | --- |
| Integration (real DB / real infra) | The rule involves DB constraints, cascades, real SQL, or unique constraints that a mock would lie about. | Auth flows gated by RLS that belong to a separate phase; anything where setup cost exceeds signal value. |
| Hermetic (stub client) | Partial failures that real infra cannot trigger easily (e.g. second operation in a sequence fails). | Rules that depend on actual DB state — a stub will lie about constraint violations and cascades. |

A non-atomic save sequence (multiple independent operations without a transaction) means: write hermetic tests for partial-failure branches, not integration tests that force a mid-sequence error.

### Oracle rules

- The oracle — what the code *should* do — must come from sources: PRD, docs, tech-stack constraints, domain knowledge. It must **not** come from reading the implementation.
- If the implementation has a bug, copying its output as the expected value produces a mirror test that passes against the bug.
- When sources do not resolve the expected behaviour unambiguously, **stop and ask** rather than guessing.
- Research's job is to surface the oracle before any test is written.

### Vibe-testing anti-patterns to avoid

| Anti-pattern | How it looks | What to do instead |
| --- | --- | --- |
| Mirror implementation | Assertion computes the expected value with the same logic as the tested code. | Assert against a value derived from the oracle (PRD / domain rule), not from the implementation. |
| Happy paths only | Tests only pass valid inputs; edge cases absent. | Add at least one edge case per risk: `null`, empty, dependency error, invalid input. |
| Redundant copies | Six nearly identical tests checking the same absence of a sentinel. | One parameterised test (`it.each`) per property; each test catches a different regression. |

### Mutation testing (Stryker) — selective quality gate

Coverage says "this line was executed". Mutation score says "would a test fail if I broke this line?" Use Stryker as a **selective gate** after a risk phase, not as a CI gate on every commit.

Workflow:
1. Tests pass for the risk phase.
2. Run `npx stryker run --mutate "path/to/file.ts"` (narrow scope to the changed module).
3. Open the HTML report; find survived mutants.
4. For each survived mutant ask: "Would this change hurt a user or the business?"
   - Yes → add an assertion that kills the mutant.
   - No (equivalent mutant or cosmetic change) → ignore consciously.
5. Do not chase 100% mutation score. A test that pins implementation details to kill a cosmetic mutant is itself a vibe test.

The integration gate can stay **ad hoc** (not on every commit) when running local infra is expensive. Mark it accordingly in `test-plan.md §4`.

### Lesson boundaries

- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch. That is Module 1 Lesson 5 / Module 2 Lesson 5.
- Do not run `/10x-test-plan` to change the risk strategy. That is Lesson 1. Use `/10x-test-plan --status` to read current state.
- Do not write tests without a research step unless using the ad-hoc prompt with full awareness of its trade-offs.

### Paths used by this lesson

- `context/foundation/test-plan.md` — §3 rollout state; §6 cookbook (filled in as phases ship)
- `context/changes/<change-id>/research.md` — oracle source per rollout phase
- `context/changes/<change-id>/plan.md` — ordered phases with `## Progress` as execution state
- `.claude/prompts/m3l2-ad-hoc-testing.md` — ad-hoc file-level testing prompt

<!-- END @przeprogramowani/10x-cli -->
