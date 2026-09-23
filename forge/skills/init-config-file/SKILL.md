---
name: init-config-file
description: >-
  Build / finalize the `config.yaml` file(s) that the renderer consumes.
  Pulls together every decision made during Phase 3 of `forge-plain` (script
  paths, template directory, build folders) and emits one canonical
  `config.yaml` per part of the project.
  Run this at the **end of `forge-plain`** (just before `plain-healthcheck`),
  at the end of `add-feature` whenever the testing surface or template
  directory changed, and any time the user wants to regenerate / consolidate
  a project's `config.yaml`.
---

# Init Config File

This skill is the **single authoritative writer** of `config.yaml` for a ***plain project. Anything that ends up in `config.yaml` should go through this skill. The renderer reads it to find the project's test scripts, templates, and output folders.

## When to run

- **End of `forge-plain` Phase 3 / start of Phase 4** — after every test-script decision is locked in (unit tests, conformance tests, prepare-environment), before delegating to `plain-healthcheck`.
- **End of `add-feature`** — only when Phase 3 of the feature touched the testing surface (new script generated, script removed, template directory introduced).
- **End of any single-skill workflow that finalizes a script or template** — e.g. after `implement-unit-testing-script`, `implement-conformance-testing-script`, `implement-prepare-environment-script`, `add-template`, or `create-import-module`.
- **On demand** — when the user asks "rebuild my config", "what valid keys are there", or you discover the config file is hand-edited / inconsistent.

If you only fixed a typo inside a `.plain` file and the testing surface didn't move, you do **not** need to re-run this skill — go straight to `plain-healthcheck`.

## What this skill does

1. Determines **how many** `config.yaml` files the project needs (one per part — see [Per-part split](#per-part-split)).
2. For each config, gathers the decided values from the current project state (existing scripts under `test_scripts/`, the template directory, the build/dest folder choices).
3. Emits a clean, alphabetically-grouped `config.yaml` containing **only** keys that are actually in use, using the canonical key names from the [Valid keys reference](#valid-keys-reference).
4. Verifies that every `*-script` value points at a file that exists on disk under `test_scripts/` (or wherever the user placed it): an absolute path (or a `~` path) is used as-is; a relative path in `config.yaml` resolves against the **config file's directory**. There is no other fallback.
5. Hands off to `plain-healthcheck` for the full validation pass.

## What this skill does NOT do

- It does **not** generate testing scripts. Use `implement-unit-testing-script`, `implement-conformance-testing-script`, or `implement-prepare-environment-script` first; this skill only wires them in.
- It does **not** decide *whether* the user wants conformance tests, a prepare-environment script, etc. Those decisions belong to `forge-plain` Phase 3. This skill only **records** them.
- It does **not** invent values for keys whose decisions weren't made — it leaves them out (the renderer falls back to its default) rather than guessing.
- It does **not** write secrets. API keys and tokens belong in environment variables, never in `config.yaml`.

## Valid keys reference

Only the keys below are valid.

YAML keys use the **dashed** form (e.g. `unittests-script`, not `unittests_script`). The only exception that has historically appeared with underscores is `template_dir`; prefer `template-dir` for new configs but accept either when reading an existing file.

These keys reflect choices made in Phase 3 of `forge-plain`:

| Key | Type | Default | When to include |
|---|---|---|---|
| `unittests-script` | path (string) | — | **Required.** Every project gets a unit-test runner. A relative path resolves against the config file's directory. |
| `conformance-tests-script` | path (string) | — | Include when the user opted into conformance testing in Phase 3. |
| `prepare-environment-script` | path (string) | — | Include only when both (a) the user opted into a prepare-environment script and (b) `conformance-tests-script` is also set. Setting prepare without conformance is a hard `plain-healthcheck` failure. |
| `test-script-timeout` | int (seconds) | `120` | Include only when the user explicitly raised/lowered the default. |
| `template-dir` | path (string) | — | Include whenever the project has an `import` module or a custom template directory (e.g. `template/`). Required for projects with shared templates. |
| `build-folder` | string | `plain_modules` | Include only when the user picked a non-default folder name. Must differ from `build-dest`. The renderer writes `<build-folder>/<module>/code` (implementation + unit tests) and `<build-folder>/<module>/tests` (conformance tests, one folder per functional spec). |
| `build-dest` | string | `dist` | **Always include with the value `dist`.** This skill pins the output destination explicitly so every project's `config.yaml` has the same, predictable target folder, visible in the file. Must differ from `build-folder`. |

Never put secrets or per-invocation options in `config.yaml`. If the user asks to, refuse and explain why.

## Per-part split

The rule, which mirrors what `forge-plain` Phase 3 already establishes, is **one `config.yaml` per part of the system that has its own testing scripts**:

- **Single-stack project** (e.g. one Python service) → one `config.yaml` at the project root.
- **Multi-part project** (e.g. Python backend + React frontend) → one `config.yaml` per part, placed next to the part's top module (e.g. `backend/config.yaml`, `frontend/config.yaml`). Each config references only its own scripts; **never mix stacks in a single config**.
- A part's split should follow the module boundaries from Phase 1 / Phase 2: if a module has its own language, framework, and test scripts, it gets its own `config.yaml` next to that module.

Before emitting anything, state the planned split to the user (e.g. "I'll emit `backend/config.yaml` and `frontend/config.yaml`") if there is more than one part.

## Workflow

### Step 1 — Inventory

1. List every `.plain` file in the repo and identify the top modules (modules not `requires`-ed by anything else) — same procedure as `plain-healthcheck` Step 1.
2. For each top module, determine which part it belongs to (single-stack → one part; multi-part → one part per top module).
3. List every script under `test_scripts/` and group them by part (e.g. `*_python.sh` belongs to the backend part, `*_js.sh` belongs to the frontend part).
4. Identify the template directory (typically `template/`) and any custom resource directories (typically `resources/`).
5. Read any **existing** `config.yaml` in each part's directory — preserve any user-set fields not listed in [Valid keys reference](#valid-keys-reference) only with the user's explicit approval.

### Step 2 — Assemble per-part values

For each part:

1. Start from an empty key set.
2. Add `unittests-script: test_scripts/run_unittests_<lang>.<sh|ps1>` — required. If the script doesn't exist yet, stop and tell the caller to run `implement-unit-testing-script` first.
3. If the part has a conformance script on disk → add `conformance-tests-script: …`.
4. If the part has a prepare-environment script on disk → first verify `conformance-tests-script` is also being added; if not, stop and surface this to the user (offer to either generate the missing conformance script via `implement-conformance-testing-script` or drop the prepare-environment script).
5. If the project has shared templates → add `template-dir: template` (or whatever path the user used).
6. **Always add `build-dest: dist`.** This skill pins the output destination on every config it writes, regardless of what Phase 3 said about it. If Phase 3 explicitly asked for a different `build-dest`, stop and surface the conflict to the user — do not silently honor the override.
7. For every other key in [Valid keys reference](#valid-keys-reference), include it **only** if Phase 3 produced a non-default decision for that key.
8. Cross-validate the assembled key set:
   - `build-dest` is set to `dist`.
   - `build-folder` ≠ `build-dest` (in particular, `build-folder` is never `dist`).
   - All `*-script` paths resolve on disk (absolute / `~` paths as-is; relative paths against the config file's directory — no other fallback).
   - No script path crosses stacks (e.g. `backend/config.yaml` must not reference `run_unittests_js.sh`).

### Step 3 — Emit `config.yaml`

For each part, write a clean YAML file:

- One key per line, in the order they appear in [Valid keys reference](#valid-keys-reference) (script paths first, then template/build folders).
- Use dashed key names. Quote string values only when YAML requires it.
- No comments inside the file — keep it machine-parseable. If the user needs a comment, put it in the surrounding spec or README.
- Idempotent: re-running this skill on an unchanged project produces a byte-for-byte identical file.

Example for a single-stack Python project with conformance testing and a prepare-environment script:

```/dev/null/config.yaml.example#L1-5
unittests-script: test_scripts/run_unittests_python.sh
conformance-tests-script: test_scripts/run_conformance_tests_python.sh
prepare-environment-script: test_scripts/prepare_environment_python.sh
template-dir: template
build-dest: dist
```

Example for a multi-part project (`backend/config.yaml`):

```/dev/null/config.yaml.example#L1-4
unittests-script: test_scripts/run_unittests_python.sh
conformance-tests-script: test_scripts/run_conformance_tests_python.sh
template-dir: ../template
build-dest: dist
```

### Step 4 — Hand off

Tell the caller exactly which file(s) were written and invoke `plain-healthcheck` to validate the project end-to-end. Do **not** declare success on your own — `plain-healthcheck` is the source of truth for "is this project ready to render?".

## Anti-patterns

- **Inventing values for keys the user never decided on.** Leave them out and let the renderer use its default.
- **Mixing stacks in one config.** `backend/config.yaml` referencing a JS script is always a bug — split into per-part configs instead.
- **Putting secrets or per-invocation options in `config.yaml`.**
- **Emitting `prepare-environment-script` without `conformance-tests-script`.** A prepare-environment script only makes sense in service of conformance tests; without one, `plain-healthcheck` will fail.
- **Hand-merging into an existing config.yaml without re-running this skill.** If the user edited the config manually, re-run the skill to re-derive a clean canonical version (after confirming any custom fields with the user).

## Validation Checklist

- [ ] One `config.yaml` exists per part of the system (single-stack → root; multi-part → per part).
- [ ] Every `config.yaml` has at minimum `unittests-script`.
- [ ] Every `*-script` value points at a file that exists on disk.
- [ ] No `config.yaml` declares `prepare-environment-script` without also declaring `conformance-tests-script`.
- [ ] No `config.yaml` mixes stacks (every script in it targets the same language).
- [ ] `build-dest` is set to `dist` in every emitted `config.yaml`.
- [ ] `build-folder` ≠ `build-dest`.
- [ ] No secrets or per-invocation options.
- [ ] `template-dir` set whenever the project has shared templates or import modules.
- [ ] `plain-healthcheck` returned `PASS` after the config(s) were written.
