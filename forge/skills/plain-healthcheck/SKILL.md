---
name: plain-healthcheck
description: >-
  Verification gate for a ***plain project. Verifies that every `config.yaml`
  exists and points at scripts that actually live in `test_scripts/`, and
  statically validates every module (frontmatter, import/requires graph,
  concepts, sections, linked resources, templates). Run this whenever anything in the project is finalized —
  including (but not limited to) the end of `forge-plain`, the end of
  `add-feature`, after `debug-specs`, after any single-skill edit that
  finalizes a concept, functional spec, requirement, template, or config —
  and any time the user asks "is the project ready to render?".
---

# Plain Healthcheck

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet. Step 3 checks every module against those rules, so they are required.

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

1. List every `.plain` file in the repo root (and any subdirectories that contain `.plain` files). Build the module graph from each file's YAML frontmatter (`requires`, `import`). Verify the `requires` graph forms a tree: every module's multiple `requires` entries must lie on one root-to-tip ancestor path.
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

### Step 3 — Statically validate every module

Check every `.plain` module from the inventory against the rules loaded by `load-plain-reference`. Collect every failure — do **not** stop at the first.

1. **Frontmatter.** It parses as YAML and uses only `description`, `import`, `requires`, `exported_concepts`, and `required_concepts`.
2. **Module graph.** Every `import` and `requires` entry resolves to an existing `.plain` file (templates against the template directory), and the graph has no cycles.
3. **Sections.** Only the five `***…***` section headers appear, and `***acceptance tests***` sit nested under a functional spec, never at the top level.
4. **Concepts.** Every `:Concept:` referenced in any section is either predefined, defined in the module's own `***definitions***`, defined in an `import`ed module, or exported by a `require`d module (`exported_concepts` are not transitive). Every concept is defined exactly once across the project, before it is used, and definitions have no cycles. Every `exported_concepts` entry is defined in its module, and every `required_concepts` entry is supplied.
5. **Section ownership.** No fact sits in a section that doesn't own it — `:UnitTests:` facts only in `***implementation reqs***`, `:ConformanceTests:` facts only in `***test reqs***`, technology only in `***implementation reqs***`.
6. **Bullets.** Every line in every section is a valid `- ` list item or a correctly indented sub-bullet — no bare continuation lines.
7. **Linked resources.** Every linked resource resolves, relative to the project root (`../` traversal allowed), to a single local text file — not a folder, URL, or binary.
8. **Templates.** Every `{% include %}`-style template reference resolves to a file in the template directory.

Functional-spec complexity is checked when a spec is authored (`add-functional-spec(s)` → `analyze-if-func-spec-too-complex`). Re-run `analyze-if-func-spec-too-complex` here only for a spec that was hand-edited since it was authored.

Treat these checks as a hard gate: the healthcheck **only passes** when every module passes every check.

#### When a check fails

Iterate until it passes:

1. Identify the offending `.plain` file, the line, and the kind of issue: missing or duplicated concept, cyclic definition, broken `import`/`requires`, misplaced fact, bare continuation line, missing resource or template, etc.
2. Fix only the `.plain` files (or the relevant `config.yaml` / template) using the appropriate edit skill — `add-concept`, `add-functional-spec`, `add-functional-specs`, `add-implementation-requirement`, `resolve-section-ownership`, `resolve-spec-conflict`, `break-down-func-spec`, `consolidate-concepts`, or an inline edit. **Never** modify generated code under `plain_modules/<module>/code/` or `plain_modules/<module>/tests/`.
3. If you are uncertain about ***plain syntax for the failing construct, re-load `load-plain-reference` before fixing.
4. Re-run the failed checks. Repeat until they pass.

If the failure is something the healthcheck cannot reasonably fix on its own (e.g. the user has to choose between two contradictory specs and neither side was pre-approved, or a missing concept whose semantics aren't clear), **stop and surface it to the user** with the offending snippet and a concrete question. Do not invent behavior.

### Step 4 — Report

Emit one of:

- **`PASS`** — followed by a short summary of what was checked: `N config.yaml(s) validated`, `M module(s) checked`, `K scripts referenced`. The caller (`forge-plain`, `add-feature`, `debug-specs`) can then continue to its hand-off step.
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
- [ ] Every module passes every static check in Step 3 (frontmatter, module graph, sections, concepts, section ownership, bullets, linked resources, templates)
- [ ] Verdict (`PASS` / `FAIL`) is on the first line, with a numbered list of remaining problems if it failed
