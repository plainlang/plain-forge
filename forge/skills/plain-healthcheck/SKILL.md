---
name: plain-healthcheck
description: >-
  Verification gate for a ***plain project. Verifies that every `config.yaml`
  exists and points at scripts that actually live in `test_scripts/`, parses
  every top module with `plain-parser check`, and checks every module for what
  the parser can't judge (section ownership, bullets, linked resources). Run this whenever anything in the project is finalized —
  including (but not limited to) the end of `forge-plain`, the end of
  `add-feature`, after `debug-specs`, after any single-skill edit that
  finalizes a concept, functional spec, requirement, template, or config —
  and any time the user asks "is the project ready to render?".
---

# Plain Healthcheck

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet. Step 3b checks every module against those rules, and they are needed to fix what `plain-parser` reports in Step 3a.

## When to run

Run this skill **whenever anything in the ***plain project is finalized** and the project is about to be left in a state the user (or another skill) might render from. That includes, but is not limited to:

- **End of `forge-plain`** (Phase 4) — before handing off the render target.
- **End of `add-feature`** (Phase 3 final review) — before declaring the feature done.
- **End of `debug-specs`** — after applying a fix, before telling the user to re-render.
- **After finalizing any single edit** that changes the renderable surface — e.g. after `add-concept`, `add-functional-spec`, `add-functional-specs`, `add-implementation-requirement`, `add-test-requirement`, `add-acceptance-test`, `add-template`, `add-resource`, `resolve-spec-conflict`, `break-down-func-spec`, `consolidate-concepts`, `refactor-module`, `create-import-module`, `create-requires-module`, or any of the `implement-*-testing-script` skills.
- **After hand-editing** a `.plain` file, a `config.yaml`, or anything under `test_scripts/`.
- **On demand** — whenever the user asks whether the project is in a renderable state.

The healthcheck is **not** a forge-plain-only step. Treat it as the default closing move for any workflow that finalizes something in the project.

Do **not** skip this skill because "the healthcheck passed earlier" — `config.yaml`s, scripts, and specs can all drift between runs. The healthcheck is cheap; rendering against stale specs is expensive.

## Workflow

The skill is a **detect → fix → re-run** loop. It does not stop at the first failure; it surfaces everything wrong, fixes what it can, and only returns when either everything passes or a gap genuinely requires user input.

### Step 1 — Inventory the project

1. List every `.plain` file in the repo root (and any subdirectories that contain `.plain` files). Build the module graph from each file's YAML frontmatter (`requires`, `import`); Step 3a validates it.
2. Identify **top modules** — every module that is not `requires`-ed by any other module. A single-stack project has one top module; a multi-part project (e.g. backend + frontend) has one top module per part.
3. List every `config.yaml` in the repo (root and per-part directories such as `backend/`, `frontend/`).
4. List every script under `test_scripts/`.
5. Pair each top module with the `config.yaml` that governs it. The pairing rule is: the config file in the same directory as the top module wins; failing that, the repo-root `config.yaml`. A multi-part project must have one config per part — record any top module that has no governing config as a failure.

Print a one-line inventory summary so the rest of the run is easy to follow, e.g. `Top modules: backend/api.plain (config: backend/config.yaml), frontend/web.plain (config: frontend/config.yaml). Scripts in test_scripts/: 4.`

### Step 2 — Validate every `config.yaml`

For each `config.yaml` in the inventory, check **all** of the following. Collect every failure — do **not** stop at the first.

1. **File parses.** It is valid YAML.
2. **At minimum `unittests-script` is present.** Every project gets a unit-test runner.
3. **For every script field that is present** (`unittests-script`, `conformance-tests-script`, `prepare-environment-script`):
   - The path is a string ending in `.sh` (macOS/Linux) or `.ps1` (Windows). The extension must match the rest of the project — do not mix `.sh` and `.ps1` in a single config.
   - The referenced file actually exists on disk: absolute / `~` paths as-is, relative paths against the **config file's directory** (typically landing under `test_scripts/`). There is no other fallback, so a path that only "works" from some other directory is a failure here.
   - On Unix, the script has the executable bit set (`-x`). If not, that is a fixable failure.
4. **No mixed stacks per config.** Every script referenced from a single `config.yaml` must target the same language/stack. For example, `backend/config.yaml` should not reference `run_unittests_js.sh`. If a config crosses stacks, that is a failure — the project should have been split into multiple configs per the applicable module rules loaded by `load-plain-reference`.
5. **No dangling fields.** Any `*-script` field whose target file does not exist is a failure.
6. **`prepare-environment-script` implies `conformance-tests-script`.** A `prepare-environment-script` only makes sense in service of conformance tests — the environment is what those tests run against. If a `config.yaml` declares `prepare-environment-script` but does **not** declare `conformance-tests-script`, that is a failure. Surface it to the user and offer to either (a) invoke `implement-conformance-testing-script` to add the missing script, or (b) remove the `prepare-environment-script` field if it was added in error. Do not auto-pick.
7. **No orphan scripts.** Every script under `test_scripts/` should be referenced by *some* `config.yaml`. If a script is never referenced, surface it as a **warning** (not a hard failure — the user may be in the middle of authoring).

For each failure, record the offending config path, the offending field, and the concrete problem (`file missing`, `not executable`, `mixed stack`, etc.).

#### Auto-fixes you may apply

- **Missing executable bit** on a script that otherwise looks fine → `chmod +x <path>`.
- **Stale path that points at a renamed script that clearly exists under a different name in `test_scripts/`** → only if there is exactly one obvious candidate (same language tag, same script kind). When in doubt, leave it for the user.

Anything else (missing script, mixed stacks, missing `config.yaml`) must be surfaced to the user — do not silently regenerate scripts here. Re-invoking `implement-unit-testing-script`, `implement-conformance-testing-script`, or `implement-prepare-environment-script` from inside the healthcheck is allowed **only** if the user explicitly approves it after being shown the gap.

### Step 3 — Validate every module

Step 3 has two halves: a mechanical parse by `plain-parser`, then the checks that need judgement. Collect every failure from both — do **not** stop at the first.

#### 3a. Parse every top module with `plain-parser`

[`plain-parser`](https://pypi.org/project/plain-parser/) is the ***plain parser. It parses a module together with its whole `import` / `requires` chain, so running it on every top module covers every module in the project.

1. **Check it is installed.** Run `plain-parser --help`. If the command is not found, stop and report `FAIL` with the install command (`pipx install plain-parser` or `uv tool install plain-parser`; it needs Python 3.11 or newer). Do **not** fall back to checking these rules by reading the files — without the parser there is no syntax gate.
2. **Run it from the top module's own directory**, once per top module:

   ```bash
   cd <top-module-dir> && plain-parser check <top>.plain
   ```

   Add `--config-name <name>` when the governing config is not named `config.yaml`. `plain-parser` reads `template-dir` from the config next to the `.plain` file or in the working directory, and exits `2` when it finds one in both — running from the module's own directory avoids that in multi-part projects.
3. **Read the result.** Exit `0` prints `<file>: OK`. Exit `1` prints `Error: …` on stderr — record that message verbatim as a failure against the top module. Exit `2` is a usage or config error (ambiguous or malformed config) — record it against the config.

`plain-parser` checks, among other things: frontmatter, that every `import` / `requires` entry exists and the graph has no cycles, that `requires` modules have one fixed order, that imported modules have no functional specs, section headings (allowed, not duplicated, `***definitions***` first, `***acceptance tests***` nested under a functional spec), concepts (defined, exported and required correctly), that a module with functional specs has implementation reqs, and that every linked resource and template resolves to an existing, relative, non-`.plain` file. It does not always report every error in one run, so after fixing what it reported, run it again until it prints `OK`.

#### 3b. Check what the parser can't judge

Check every `.plain` module against the rules loaded by `load-plain-reference`:

1. **Section ownership.** No fact sits in a section that doesn't own it — `:UnitTests:` facts only in `***implementation reqs***`, `:ConformanceTests:` facts only in `***test reqs***`, technology only in `***implementation reqs***`.
2. **Bullets.** Every line in every section is a valid `- ` list item or a correctly indented sub-bullet — no bare continuation lines.
3. **Linked resources.** Every linked resource is a single **text** file (not a binary), and no URL or folder path appears in the surrounding spec text unless it is a runtime value the generated software itself uses.

Functional-spec complexity is checked when a spec is authored (`add-functional-spec(s)` → `analyze-if-func-spec-too-complex`). Re-run `analyze-if-func-spec-too-complex` here only for a spec that was hand-edited since it was authored.

Treat 3a and 3b together as a hard gate: the healthcheck **only passes** when `plain-parser check` prints `OK` for every top module and every module passes every check in 3b.

#### When a check fails

Iterate until it passes:

1. Identify the offending `.plain` file, the line, and the kind of issue: missing or duplicated concept, cyclic definition, broken `import`/`requires`, misplaced fact, bare continuation line, missing resource or template, etc.
2. Fix only the `.plain` files (or the relevant `config.yaml` / template) using the appropriate edit skill — `add-concept`, `add-functional-spec`, `add-functional-specs`, `add-implementation-requirement`, `resolve-section-ownership`, `resolve-spec-conflict`, `break-down-func-spec`, `consolidate-concepts`, or an inline edit. **Never** modify generated code under `plain_modules/<module>/code/` or `plain_modules/<module>/tests/`.
3. If you are uncertain about ***plain syntax for the failing construct, re-load `load-plain-reference` before fixing.
4. Re-run the failed checks — for a `plain-parser` failure, re-run `plain-parser check`. Repeat until they pass.

If the failure is something the healthcheck cannot reasonably fix on its own (e.g. the user has to choose between two contradictory specs and neither side was pre-approved, or a missing concept whose semantics aren't clear), **stop and surface it to the user** with the offending snippet and a concrete question. Do not invent behavior.

### Step 4 — Report

Emit one of:

- **`PASS`** — followed by a short summary of what was checked: `N config.yaml(s) validated`, `M module(s) checked (plain-parser OK for every top module)`, `K scripts referenced`. The caller (`forge-plain`, `add-feature`, `debug-specs`) can then continue to its hand-off step.
- **`FAIL`** — followed by a numbered list of every unresolved problem. Each entry must include: the file (config / `.plain` / script) it applies to, the concrete issue, and what the user needs to decide if the healthcheck couldn't resolve it.

The verdict goes on the first line so callers can pattern-match without parsing the whole report.

## What this skill does NOT do

- It does **not** author new specs from scratch — use `forge-plain` / `add-feature` for that.
- It does **not** render anything.
- It does **not** execute the testing scripts (`run_unittests`, `run_conformance_tests`, `prepare_environment`). It only verifies that the scripts are wired up correctly via `config.yaml`. The user runs the scripts themselves.
- It does **not** silently regenerate config files or scripts. The most it does is `chmod +x` and (with user approval) re-invoke the relevant `implement-*-testing-script` skill.

## Validation Checklist

- [ ] Every `.plain` module was inventoried and every top module was identified
- [ ] Every top module is governed by exactly one `config.yaml`
- [ ] Every `config.yaml` parses as YAML and has at least `unittests-script`
- [ ] Every `*-script` field points at a file that exists under `test_scripts/`
- [ ] No `config.yaml` mixes stacks (e.g. Python + JS scripts in the same file)
- [ ] No `config.yaml` declares `prepare-environment-script` without also declaring `conformance-tests-script`
- [ ] Every `test_scripts/*` file is referenced by some `config.yaml` (or surfaced as a warning)
- [ ] `plain-parser check` printed `OK` for every top module, run from that module's directory
- [ ] Every module passes every check in Step 3b (section ownership, bullets, linked resources)
- [ ] Verdict (`PASS` / `FAIL`) is on the first line, with a numbered list of remaining problems if it failed
