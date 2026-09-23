# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`plain-forge` is an npm package with two distinct halves:

1. **A tiny installer CLI** (`bin/cli.mjs`) — `npx plain-forge install|update|uninstall`.
2. **The actual product** under `forge/` — a library of AI-agent *skills* and *rules* that teach an agent to author and maintain `***plain` specification files. The CLI copies `forge/` verbatim into an agent directory; there is **no build step** and no generated/committed output.

So a change here is almost always one of: (a) editing the installer CLI, or (b) editing the instructional content under `forge/skills/` and `forge/rules/`. These need different mindsets — see "Editing `forge/` content" below.

`plain-forge` only *authors* `.plain` specs. Rendering specs into code is done by a **separate** renderer, which this repo does not contain.

## Commands

```bash
npm test                                                   # full suite: node --test test/*.test.mjs
node --test --test-name-pattern="<regex>" test/*.test.mjs  # run a single test by name
node --test test/cli.test.mjs                              # run a single test file
```

- Test runner is **Node's built-in `node:test`** (`node:assert/strict`) — not jest/vitest, no test framework dependency. Requires Node ≥18.
- `test/cli.test.mjs` mixes unit tests (importing named exports from `bin/cli.mjs`) with black-box integration tests that `spawnSync` the real CLI into isolated temp `HOME`/cwd dirs.
- Releases are cut by publishing a GitHub Release tagged `vX.Y.Z`, which publishes to npm via OIDC — see [RELEASING.md](RELEASING.md). The version lives in the tag, so `package.json` on `main` is intentionally stale.
- **There is no working build or lint step.** `package.json` declares `build`/`clean` scripts (`tsx bin/forge-build.ts`) and `tsconfig.json` references `bin/**/*.ts` + `runtimes/**/*.ts`, but **those files do not exist** — `npm run build`/`npm run clean` error out. The TS toolchain (tsx/typescript) is vestigial; the CLI is plain `.mjs` run directly by Node. Don't try to build.

## The installer CLI (`bin/cli.mjs`)

A single self-contained ESM file with **zero runtime dependencies**; it exports its internals so the test suite can import them without running `main()` (guarded by `isInvokedDirectly()`, which realpath-compares `argv[1]` to `__filename` — needed because the global bin is a symlink). Key model:

- `AGENTS` maps agent name → content dir: `claude→.claude`,
  `codex|copilot|universal→.agents`, `forgecode→.forge`, and `opencode→.opencode`.
  `SCOPES`: `project` (cwd) / `global` (`$HOME`). Global ForgeCode and OpenCode paths have explicit
  exceptions in `resolveBaseDir`. `CONTENT_DIRS = [skills, rules, docs]` (missing source dirs are
  silently skipped).
- **install** writes `forge/{skills,rules,docs}` into `<agentDir>/`, recording every written file in `<agentDir>/.plain-forge/manifest.json`. It **refuses** (exit 1) if a manifest or a "forge signature" already exists — install never overwrites in place; you use `update` for that.
- **update** auto-detects every install across both scopes × all agents, re-copies the fresh tree, and **prunes** files that were in the old manifest but no longer ship (confirmed individually unless `--yes`). Only manifest-recorded files are ever prune candidates, so the user's own/third-party files are never touched.
- **uninstall** deletes exactly `manifest.files` then the manifest; refuses (exit 1) on a manifest-less install rather than guessing which files are its own.
- Legacy (manifest-less) installs are recognized only when **all** of `FORGE_SIGNATURE_SKILLS` (`forge-plain`, `add-feature`, `debug-specs`, `load-plain-reference`) are present, then refreshed and given a manifest going forward.

When changing install/update/uninstall behavior, update `test/cli.test.mjs` accordingly — it is the spec for this CLI.

## Editing `forge/` content (skills + rules)

This is the heart of the product. Everything under `forge/` is **instructional text consumed by an AI agent at author-time**, not code that executes. Four consequences:

- **`forge/rules/` is the sole source of truth for writing `.plain`.** Every syntax rule,
  section-ownership rule, constraint, and canonical `.plain` example belongs in the applicable rule
  file. Do not duplicate authoring guidance in skills or skill references; duplication drifts and
  creates contradictory instructions.
- **`load-plain-reference` is a router, not a language guide.** Its `SKILL.md` stays concise and maps
  the current task to only the applicable files under `forge/rules/`. It may route to focused
  operational references for project layout or rendering/testing, but those references must not
  restate `.plain` authoring rules. Integration rules load only for integration work. Claude skips
  rereading rules already supplied natively; other agents read only rules not already in context.
- **Example hygiene is load-bearing.** The rules teach `.plain` syntax, and a `.plain` example written the wrong way *leaks* — agents imitate it. Bare-continuation examples may appear **only** inside blocks explicitly labeled BAD / WRONG / `Before:` / `Too complex:`. Every "good"/"after"/"acceptable"/canonical/`## Format` example must make each line a valid `- ` list item. (`forge/rules/bullet-continuation.md` is the canonical rule.)
- **Skills are narrow and chained.** Each `forge/skills/<name>/SKILL.md` has YAML frontmatter (`name` = dir name, `description` = a `>-` block ending in a "Use when…" trigger) and a prose body. Most spec-touching skills invoke `load-plain-reference` first so it can select the relevant rules. Large or operational detail belongs in a skill's `references/` directory and loads only when needed. Only the three test-script generators (`implement-{unit-testing,conformance-testing,prepare-environment}-script`) carry an `assets/` dir of reference `.sh`/`.ps1` scripts.

### The `.plain` model the content describes

A `.plain` file is a module: YAML frontmatter (`description`, `import:`, `requires:`, `exported_concepts:`, `required_concepts:`) plus up to five triple-asterisk sections. **Where a fact lives is strict and enforced** — the renderer reads each concept only from its owning section, so a misplaced fact is silently ignored:

| Section | Owns |
|---|---|
| `***definitions***` | concepts as `:CamelCaseToken:`, define-before-use, globally unique, no cycles |
| `***implementation reqs***` | HOW it's built (tech/architecture) **and everything about `:UnitTests:`** |
| `***functional specs***` | WHAT it does — observable, language-agnostic; each spec ≤200 changed LOC; rendered incrementally top-to-bottom |
| `***test reqs***` | **everything about `:ConformanceTests:`** (framework, run command, mocking/network policy) |
| `***acceptance tests***` | nested under a functional spec (not top-level); full end-to-end workflows |

Other constraints the rules enforce (see `forge/rules/`): functional specs are mandatorily routed through `add-functional-spec(s)` (never hand-authored), checked for the 200-LOC limit (`analyze-if-func-spec-too-complex` → `break-down-func-spec`) and for conflicts (`analyze-func-specs` → `resolve-spec-conflict`); external artifacts (JSON Schema, OpenAPI, payloads) are **linked** as single local text files under `resources/`, never transcribed and never folders/URLs/binaries; generated output under `plain_modules/<module>/code/` (implementation + unit tests) and `plain_modules/<module>/tests/` (conformance tests) is read-only — fixes go back into the spec and re-render.

### The skill lifecycle (orchestration)

`forge-plain` is the top-level orchestrator: a short Phase 0 intent interview followed by four gated phases — (1) definitions + functional specs, (2) implementation reqs / tech stack, (3) testing (unit→impl reqs, conformance→test reqs, generate `test_scripts/`, build `config.yaml`, probe host via `check-plain-env`), (4) validate via `plain-healthcheck` (static checks of configs, scripts, and every module) then hand off the render target. Phases 1–3 are **one-question-at-a-time, write-to-disk-immediately**. `add-feature` is the same authoring loop scoped to one feature on an existing project; `init-plain-project` is a no-interview scaffold. The installer ships `forge/rules/*.md` beside the skills; native rule consumers load them directly, while other agents reach them through `load-plain-reference`.

## Memory / persistent context

- Generated artifacts and project scratch (`plain_modules/`, `test_scripts/`, `*.yaml`, env files) are gitignored. The renderer writes everything it generates under `plain_modules/<module>/`: `code/` for implementation and unit tests, `tests/` for conformance tests (one folder per functional spec).
