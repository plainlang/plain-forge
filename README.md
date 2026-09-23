<p align="center">
  <img src="assets/plain-forge.png" alt="plain-forge" width="600" />
</p>

# plain-forge

A toolkit for working with [∗∗∗plain](https://plainlang.org) projects from inside your AI coding agent of choice — Claude Code, Codex, ForgeCode, OpenCode, and any other agent that reads from a standard skills directory. plain-forge ships skills, rules, and docs that turn a conversation into complete `.plain` spec files, then keeps maintaining them across the lifetime of the project. The specs are rendered into production-ready code by the [codeplain](https://codeplain.ai) renderer.

## What plain-forge does

plain-forge is organized around four kinds of work, each with its own entry-point skill (and a long tail of supporting skills behind it).

### 1. Bootstrap a new project

Pick whichever entry point matches how much upfront design you want:

- **`forge-plain`** — full end-to-end interview. One question at a time, immediate writes to disk, covers product → tech stack → testing → validation in four phases. Produces a complete `.plain` project with `config.yaml`, test scripts, and a successful `codeplain --dry-run` before handing off.
- **`init-plain-project`** — lightweight scaffold. Asks only about the base technology, project kind, and whether conformance testing is on; emits a template module, a stub top-level module, the testing scripts, and a `config.yaml`. No interview, no specs — pair it with `add-feature` to grow the project feature by feature.

### 2. Grow an existing project

- **`add-feature`** — takes a feature request in plain English and runs the same one-question-at-a-time loop that `forge-plain` uses, scoped to a single feature against an existing `.plain` file.
- **Per-section authoring skills** — `add-functional-spec`, `add-functional-specs`, `add-implementation-requirement`, `add-test-requirement`, `add-concept`, `add-acceptance-test`, `add-resource`, `add-template`. Each enforces the relevant ***plain syntax rules (concept uniqueness, complexity limits, bullet syntax, linked-resource constraints, …) so hand-authoring doesn't drift from the language.
- **Module-management skills** — `create-import-module`, `create-requires-module`, `refactor-module`, `consolidate-concepts` for restructuring as the project grows.

### 3. Validate and maintain

- **`plain-healthcheck`** — the verification gate. Inventories every `.plain` module, validates every `config.yaml`, and dry-runs every top module with the right config. Returns `PASS` / `FAIL` with a numbered punch-list when something is broken.
- **`init-config-file`** — assembles the canonical `config.yaml` per part of a project from the decisions made during interviewing.
- **`check-plain-env`** — probes the host machine for everything the project needs (language toolchains, external services, system binaries, drivers, `codeplain` itself) and emits a `PASS` / `WARN` / `FAIL` report with OS-specific install commands.
- **`analyze-func-specs`** / **`analyze-if-func-spec-too-complex`** / **`break-down-func-spec`** / **`resolve-spec-conflict`** — the spec-quality toolchain that runs behind `add-feature` and `forge-plain` but can also be invoked directly when reviewing or refactoring.

### 4. Debug and render

- **`debug-specs`** — when the rendered app misbehaves, this traces the generated code back to the spec that caused it and fixes the spec (never the generated code).
- **`run-codeplain`** — experimental supervised render. Launches `codeplain` for you, tails the log, watches generated code appear under `plain_modules/`, and detects pathologies (stuck conformance loops, complexity errors, missing concepts, render failures). On approval it stops the renderer, hands off to the right spec-edit skill, and resumes.
- **`render-spec`** — [pyro](https://github.com/plainlang/pyro), the open-source ***plain renderer, bundled with plain-forge. Renders a `.plain` module (and the modules it requires or imports) into working, tested code directly inside your agent. See [Render with pyro](#render-with-pyro).
- **`implement-unit-testing-script`** / **`implement-conformance-testing-script`** / **`implement-prepare-environment-script`** — generate the per-language testing scripts that the renderer and you both invoke. New languages can be added by these skills without touching any other part of the project.

Each skill operates on the same one-question-at-a-time, write-immediately, refine-through-follow-ups loop. Specs land on disk after every answer; later answers fix earlier writes in place. There is no batched interview, no "I'll gather context first," and no hand-authored functional specs — every new spec goes through the authoring skills so the complexity and conflict checks actually run.

## Getting Started

plain-forge ships as a set of skills, rules, and docs that plug into your AI coding tool of choice. Install it once, then invoke `forge-plain` (or `add-feature` to add a feature to an existing ***plain project) from any project.

### Install with `npx plain-forge install`

The one and only way to install plain-forge. It works for every supported runtime and ships **all** plain-forge content (skills, rules, **and** docs).

```bash
npx plain-forge install
```

This prompts you to pick an agent and a scope using an arrow-key menu. You can also pass both flags non-interactively:

```bash
npx plain-forge install --agent claude --scope project
```

**Agent options:**

| `--agent` | Installs into (project · global) | Use when |
|-----------|---------------|----------|
| `claude` | `.claude/` · `~/.claude/` | You use Claude Code |
| `codex` | `.agents/` · `~/.agents/` | You use the OpenAI Codex CLI |
| `copilot` | `.agents/` · `~/.agents/` | You use GitHub Copilot |
| `forgecode` | `.forge/` · `~/forge/` | You use ForgeCode |
| `opencode` | `.opencode/` · `~/.config/opencode/` | You use OpenCode |
| `universal` | `.agents/` · `~/.agents/` | You want a runtime-neutral layout that any agent reading from `.agents/` can pick up |

> **Why several agents share `.agents/`.** Codex and GitHub Copilot both discover skills from
> `.agents/skills` (`~/.agents/skills` globally), which is also the runtime-neutral `universal`
> layout. ForgeCode instead reads `.forge/skills` (`~/forge/skills` globally). The manifest records
> which agent label you chose so `update` and `uninstall` report it correctly.

**Scope options:**

| `--scope` | Installs into | Use when |
|-----------|---------------|----------|
| `project` | the agent's project dir in the current working directory | You want plain-forge in just this project |
| `global` | the agent's user-level dir in your home directory | You want plain-forge available in every project on the machine |

(See the per-agent table above for the exact project/global directory each agent uses — a few diverge from the plain `~/<dir>` pattern, e.g. OpenCode global is `~/.config/opencode/` and ForgeCode global is `~/forge/`.)

Each install writes three subfolders under the chosen directory:

```
<agent-dir>/
  skills/    # every plain-forge skill
  rules/     # spec-writing rules (see "How the rules get applied" below)
  docs/      # shared reference docs
```

#### How the rules get applied per agent

The `skills/` are discovered natively by every supported agent. The `load-plain-reference` skill
loads only the rules relevant to the current task and skips rules already present in context. Some
agents additionally support native rules wiring:

| Agent | How rules are applied |
|-------|-----------------------|
| **Claude Code** | Native — Claude Code auto-loads `.claude/rules/*.md` at launch. Each rule carries `paths: "**/*.plain"` frontmatter so Claude scopes it to `.plain` files. No extra wiring. |
| **OpenCode** | OpenCode doesn't auto-load a `rules/` dir; it reads globs from the `instructions` array in `opencode.json`. plain-forge **merges** a rules glob there — `.opencode/rules/*.md` (project, written to `./opencode.json`) or the absolute `~/.config/opencode/rules/*.md` (global, written to `~/.config/opencode/opencode.json`; absolute because OpenCode doesn't expand `~`). |
| **ForgeCode** | plain-forge also appends a fenced managed pointer block to `AGENTS.md`: repo-root `./AGENTS.md` for project installs or `~/forge/AGENTS.md` globally. |
| **Codex / GitHub Copilot / Universal** | No extra instruction file is generated. Their discovered `load-plain-reference` skill loads applicable files from `.agents/rules/` when needed. |

When plain-forge touches `opencode.json` or ForgeCode's `AGENTS.md`, it merges into existing content
and leaves unrelated configuration intact. `uninstall` removes only plain-forge's glob or block.

`install` refuses to run if plain-forge is already present at the target directory — it prints a message pointing you at `update` and exits non-zero. Use `update` (below) to refresh an existing install.

#### Updating an existing install

```bash
npx plain-forge@latest update
```

`update` auto-detects every plain-forge install in the current folder and in your home directory (across all agent layouts) and refreshes each one in place — no agent/scope prompts. For each install it compares the version recorded in the manifest against the version you're running: if the package version did not increase, it leaves that install untouched and tells you it's already up to date. Unlike `install`, it also **prunes** files that were removed from the package (e.g. a deleted skill) by consulting a manifest (`<agent-dir>/.plain-forge/manifest.json`) that records exactly which files plain-forge wrote. Your own skills and any third-party skills sharing the same directory are never in that manifest, so they are never touched.

Each deprecated file is confirmed individually before it's deleted — you'll see its path and a `[y/N]` prompt. Denied files stay on disk and remain tracked, so the next `update` re-offers them. Pass `--yes` (or `-y`) to remove all deprecated files without prompting (useful in CI); when there's no interactive terminal and `--yes` is not given, nothing is deleted.

Installs that predate the manifest (anyone who installed before this feature existed) have no manifest to read. `update` still finds them by their skill footprint: if the `forge-plain`, `add-feature`, `debug-specs`, and `load-plain-reference` skills are all present in an agent directory, it's treated as a plain-forge install. Such installs are refreshed without pruning (overwrite-only), and gain a manifest going forward so later updates can prune.

#### Removing an install

```bash
npx plain-forge uninstall
```

`uninstall` reads the install manifest (`<agent-dir>/.plain-forge/manifest.json`) and deletes **exactly** the files plain-forge wrote, then the manifest itself, then removes its rules wiring (the `opencode.json` glob or the `AGENTS.md` pointer block, for the relevant agents), then any directory left empty (including the agent directory). Your own skills and third-party content are never in the manifest, so they are never touched.

By default it removes **every** agent layout in the **project** scope (the current folder). Narrow it with flags:

```bash
npx plain-forge uninstall --agent claude --scope global
```

| Flag | Default | Values |
|------|---------|--------|
| `--agent` | `*` (all agents) | `claude`, `codex`, `copilot`, `forgecode`, `opencode`, `universal`, or `*` |
| `--scope` | `project` | `project` (cwd) or `global` (home directory) |

If an install has **no manifest** (e.g. one that predates manifests), `uninstall` cannot tell which files are plain-forge's, so it refuses to delete anything: it prints an error, lists the directories to clean up by hand, and exits non-zero. Refresh such an install with `update` first (which writes a manifest going forward), then `uninstall`.

## Usage

### Prerequisites

1. Open your project folder and start a session in your favorite AI coding agent (Claude Code, OpenCode, Codex, …).
2. Make sure the plain-forge skills are available in that session.

### Starting a new project

1. Invoke `forge-plain` to launch the structured QA workflow.
2. Answer the questions. plain-forge writes the `.plain` files for you as you go through the four phases.
3. Render the specs into code (see [Rendering specs](#rendering-specs) below).

### Starting a new project — incremental workflow

If you'd rather skip the full upfront interview and build the specs feature-by-feature, use this lighter loop:

1. Invoke `init-plain-project`. It asks just for the base technology, the project kind, and whether conformance testing is enabled, then scaffolds the project skeleton: `template/base.plain` with the base `***implementation reqs***` and `***test reqs***`, a stub top-level `<project>.plain` (frontmatter only — no functional specs, no concepts), the unit-test script, an optional conformance-test script, an optional prepare-environment script, and a `config.yaml` wired to whichever scripts were generated. No `codeplain --dry-run` is run.
2. From there, either:
   - **Converse with the agent.** Just describe the next feature in plain English; the agent will invoke `add-feature` for you and run its one-question-at-a-time loop until the feature is on disk.
   - **Invoke `add-feature` manually** whenever you want to drive the loop yourself.
3. Repeat step 2 for each feature you want to add. The specs grow incrementally and `plain-healthcheck` is run as the final automated step of every `add-feature` pass.
4. Render the specs into code (see [Rendering specs](#rendering-specs) below).

### Adding a feature to an existing project

1. Invoke `add-feature`.
2. Describe the feature in plain English. plain-forge runs the same **ask → author → review** loop scoped to that feature and updates the relevant `.plain` file(s).
3. Re-render to regenerate the code (see [Rendering specs](#rendering-specs)).

### Rendering specs

Once your `.plain` files are ready (and `plain-healthcheck` is green), render the specs into code with the [Codeplain](https://codeplain.ai) renderer:

```bash
codeplain <module>.plain
```

plain-forge prints the exact command (with the right final module name) at the end of Phase 4.

#### Supervised render (experimental)

If you'd rather have plain-forge babysit the run from your AI coding agent, invoke `run-codeplain`. It launches the renderer for you, tails `codeplain.log`, watches generated code appear under `plain_modules/`, and surfaces what's happening in plain English. If it detects a pathology (stuck conformance loop, complexity error, missing concept, render failure), it asks for approval to stop the renderer, hands off to the right spec-edit skill (`debug-specs`, `resolve-spec-conflict`, `break-down-func-spec`, …), and resumes the render from the last completed functionality via `--render-from`.

This is an **experimental** feature — the default and most reliable way to render is still the manual `codeplain <module>.plain` invocation above.

#### Render with pyro

plain-forge ships [pyro](https://github.com/plainlang/pyro), an open-source renderer packaged as the `render-spec` skill that renders inside your AI coding agent. Invoke it with the module to render:

```
/render-spec <module>.plain
```

It resolves the modules the target requires or imports, renders them in dependency order, and writes:

- implementation code and unit tests to `plain_module/code/`
- conformance tests to `plain_module/tests/`
- the target module's final output to `dist/`
- its working files (render plan, dependencies, scenarios, requirement lists) to `.pyro/`

pyro needs **Python 3.8 or newer** on the machine and nothing else. `npx plain-forge@latest update` updates pyro along with the rest of plain-forge.

### Debugging specs

Hit a bug in the rendered app, a failing test, or behavior that doesn't match what you specified?

1. Invoke `debug-specs`. plain-forge reads the generated code in `plain_modules/` (and the failing tests, if any), traces the issue back to the responsible `.plain` spec, and diagnoses the root cause — **ambiguous spec**, **missing spec**, **conflicting specs**, **incorrect spec**, or a **missing implementation req**.
2. plain-forge applies the fix in the `.plain` file(s) only and summarizes what changed.
3. Re-render to regenerate the code (see [Rendering specs](#rendering-specs)).

> **Important:** Never edit generated output under `plain_modules/` directly — neither the code in `plain_modules/<module>/code/` nor the conformance tests in `plain_modules/<module>/tests/`. Your changes will be overwritten on the next render. Always fix the spec and re-render.


## Repository Structure

plain-forge keeps a single canonical source of truth under `forge/`. The `plain-forge install` CLI copies that content straight into whichever agent directory you choose — there is no build step and no generated, committed output to keep in sync.

```
forge/                       # canonical content, copied verbatim on install
  skills/                    # all skills used during spec writing
  rules/                     # spec-writing rules (installed as workspace instructions)

bin/
  cli.mjs                    # the `plain-forge` CLI — `install` and `update` commands

vendor/
  pyro/                      # git submodule: plainlang/pyro, pinned to the release plain-forge ships

scripts/
  bundle-pyro.sh             # copies vendor/pyro's `render-spec` skill into forge/skills/ at publish time
  deploy.sh                  # publishes a release to npm from a workstation

test/
  cli.test.mjs               # tests for the install / update CLI

package.json                 # ships only `bin/cli.mjs` and `forge/` to npm
```

### Bundled pyro skill

The `render-spec` skill comes from [pyro](https://github.com/plainlang/pyro), which has its own release cycle. It is included as a **git submodule** at [`vendor/pyro`](vendor/pyro), so the exact pyro commit plain-forge ships is visible in the repository. Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/plainlang/plain-forge.git
# or, in an existing clone:
git submodule update --init
```

Agents only discover skills that sit directly under `skills/`, so the npm publish CI job copies `vendor/pyro/skills/render-spec` into `forge/skills/render-spec` (gitignored) with `scripts/bundle-pyro.sh` just before `npm publish`. Run the script yourself to try the skill locally.

To ship a newer pyro, bump the submodule to pyro's `main` (it only ever points at pyro's latest stable release) and commit the new pointer:

```bash
git submodule update --remote vendor/pyro
git add vendor/pyro
git commit -m "Bump pyro to vX.Y.Z"
```

On `install`, the CLI reads `forge/skills` and `forge/rules` and writes them into the chosen agent directory (`.claude/`, `.agents/` for Codex/Copilot/universal, `.forge/`, or `.opencode/` — see the per-agent table above for global-scope paths), recording every file it wrote in `<agent-dir>/.plain-forge/manifest.json` so `update` can later refresh and prune precisely. For agents that need it, it also wires the rules into `opencode.json` or ForgeCode's `AGENTS.md` (see [How the rules get applied per agent](#how-the-rules-get-applied-per-agent)).

## Available Skills

### Core Workflow

| Skill | Description |
|-------|-------------|
| `forge-plain` | End-to-end QA interview that produces complete `.plain` spec files for a new project |
| `init-plain-project` | Lightweight project initializer — scaffolds `template/base.plain` (base impl + test reqs), a stub top-level module, the testing scripts, and `config.yaml`. No functional specs, no concepts, no dry-run. Pair with `add-feature` to grow the project feature-by-feature. |
| `add-feature` | Interview the user about a single feature, then write all the specs for it |
| `render-spec` | [pyro](https://github.com/plainlang/pyro), the open-source renderer: renders a `.plain` module and the modules it requires or imports into working, tested code, from inside your agent. See [Render with pyro](#render-with-pyro). |
| `run-codeplain` | **Experimental.** Launch a `codeplain` render and supervise it end-to-end — tails `codeplain.log`, watches generated code appear, detects pathologies (stuck conformance loops, complexity errors, missing concepts, render failures), and on approval stops the renderer, hands off to the right spec-edit skill, and resumes with `--render-from`. The default render path is still the manual `codeplain <module>.plain` command. |

### Spec Authoring

| Skill | Description |
|-------|-------------|
| `add-functional-spec` | Add a single feature spec to `***functional specs***` |
| `add-functional-specs` | Add multiple feature specs to `***functional specs***` in one pass (same per-spec checks as `add-functional-spec`) |
| `add-implementation-requirement` | Add a non-functional requirement to `***implementation reqs***` |
| `add-test-requirement` | Add a testing requirement to `***test reqs***` |
| `add-concept` | Define a new concept in `***definitions***` |
| `add-acceptance-test` | Add verification criteria under a functional spec |
| `add-resource` | Link an external file (schema, API spec) to a spec |
| `add-template` | Create or include a reusable Liquid template |

### Module Management

| Skill | Description |
|-------|-------------|
| `create-import-module` | Create a shared template module (definitions + reqs, no functional specs) |
| `create-requires-module` | Create a module that depends on a previously built module |
| `refactor-module` | Split a large module into smaller modules connected via a requires chain |
| `consolidate-concepts` | Gather scattered concept definitions into a single shared import module |

### Analysis and Quality

| Skill | Description |
|-------|-------------|
| `init-config-file` | Build / finalize the project's `config.yaml` file(s) from the decisions made in Phase 3. Knows the full set of valid keys derived from the `codeplain` CLI, refuses to write secrets or per-invocation flags, and produces one config per part of the project. Run at the end of `forge-plain` (just before `plain-healthcheck`) and any time the testing surface changes. |
| `plain-healthcheck` | Verification gate: validates every `config.yaml`, confirms each `*-script` field points at a real file in `test_scripts/`, and dry-runs every top module. Run whenever anything in the project is finalized — at the end of `forge-plain`, at the end of `add-feature`, after `debug-specs`, and after any single-skill edit that touches the renderable surface. |
| `check-plain-env` | Read the project's `.plain` files, `test_scripts/`, `config.yaml`(s), and `resources/`, then probe the host for every requirement **the package manager can't install**: language toolchains (`python` + `pip`, `node` + `npm`, JDK + `mvn`, Go, Rust, .NET, etc.), external services (Postgres, Redis, Docker, ...), system binaries that language packages wrap (`ffmpeg`, `tesseract`, `pdftoppm`, browser binaries, ...), hardware / drivers / accelerators (NVIDIA driver → CUDA toolkit → cuDNN → framework-sees-GPU chain), `codeplain` itself, and credential env vars. Does **not** probe individual language packages — `pip install -r requirements.txt` (and equivalents) handle those when the test scripts run. Emits a `PASS` / `WARN` / `FAIL` report with OS-specific install commands for any gaps. Read-only — never installs anything. Run on first-time setup, before rendering on a new machine, after adding a new tech to a project, or any time `command not found` shows up in test output. |
| `analyze-if-func-spec-too-complex` | Check if a spec exceeds the 200-line complexity limit |
| `analyze-func-specs` | Check a batch of specs (2+) against each other in one call and return every conflicting pair |
| `analyze-2-func-specs` | Legacy: check exactly two specs for conflicts (prefer `analyze-func-specs`) |
| `break-down-func-spec` | Split an overly complex spec into smaller specs (each ≤ 200 LOC) |
| `resolve-section-ownership` | Move each fact to the section that owns it — splits a bullet carrying several kinds of fact, and relocates a misplaced one the renderer is silently ignoring |
| `resolve-spec-conflict` | Resolve a conflict between two functional specs |

### Debugging and Testing

| Skill | Description |
|-------|-------------|
| `debug-specs` | Investigate a bug by tracing generated code back to specs and fixing only the `.plain` files |
| `implement-unit-testing-script` | Generate a per-language unit-test runner (`run_unittests_<lang>.sh` / `.ps1`) |
| `implement-conformance-testing-script` | Generate a per-language conformance-test runner; picks the install-inline or activate-only variant based on whether `prepare_environment_<lang>` exists |
| `implement-prepare-environment-script` | Generate a per-language one-time setup script (`prepare_environment_<lang>.sh` / `.ps1`) that stages the build and pre-warms dependencies so conformance tests start cold; reconciles any existing conformance script to remove its now-redundant install step |
