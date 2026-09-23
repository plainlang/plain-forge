# Phase 4 — Validate and hand off

Two halves. First **the agent** validates every spec with `plain-healthcheck` so the user never wastes a real render — or any debugging time — on a fixable static error. Only after that passes does the agent **hand off** the render target (plus any side-channel commands) to the user.

## 4a. Identify the render target

Find the **last module in the dependency chain** — the module that is not `requires`-ed by any other module. If there is only one module, use it. Call this module `<module>`.

- Chain `base.plain → features.plain → integrations.plain` → render target is `integrations.plain`.
- Single module `my_app.plain` → render target is `my_app.plain`.

## 4b. Build the final `config.yaml` with `init-config-file`

Finalize the project's `config.yaml` file(s) before validation. Phase 3 may have written provisional entries as scripts were generated; **this** is where they are consolidated into the canonical form the renderer expects. Invoke the `init-config-file` skill. It:

- enumerates every part of the project (one `config.yaml` per part — single-stack → root config; multi-part → one config per part),
- assembles only the **valid** config keys,
- emits a clean YAML file per part (script paths first, then template/build folders),
- verifies every `*-script` value resolves to a real file on disk,
- refuses to write secrets or per-invocation options into the config.

If `init-config-file` stops because a precondition isn't met (e.g. a `prepare-environment-script` exists but no conformance script does), resolve the gap with the user before continuing — do **not** hand a known-broken config to `plain-healthcheck`.

## 4c. Validate the project with `plain-healthcheck`

Run the `plain-healthcheck` skill — the single source of truth for "is this project ready to render?". Do **not** run its checks inline. It:

- inventories every `.plain` module and identifies every top module,
- validates every `config.yaml` (existence, parseability, script paths actually pointing at files in `test_scripts/`, no mixed stacks), and
- statically validates every module against the ***plain rules (frontmatter, `import` / `requires` graph, concepts, sections, linked resources, templates).

The skill runs the full detect → fix → re-run loop itself (syntax errors, undefined concepts, broken `import` / `requires` chains, cyclic definitions, missing templates, misplaced facts, config drift, missing scripts) and returns only once everything passes or a gap genuinely needs the user. Then:

- **`PASS`** → move on to step 4d.
- **`FAIL`** → do **not** ask the user to render. Work through the numbered list it produced (each item references a specific `.plain` file, `config.yaml`, or script), resolve each one with the appropriate edit skill, and re-run `plain-healthcheck` until it returns `PASS`. Any item the skill could not auto-resolve will name the concrete question to put to the user.

## 4d. Hand off the render target

Only after `plain-healthcheck` passes, tell the user their specs are ready and that `<module>` is the module to render:

- Chain `base.plain → features.plain → integrations.plain` → render `integrations.plain`.
- Single module `my_app.plain` → render `my_app.plain`.

Also remind the user of any **side-channel commands** they may want to run themselves per the Phase 3 testing strategy — for example `./test_scripts/run_unittests.sh <module>`, `./test_scripts/prepare_environment.sh <module>`, or `./test_scripts/run_conformance_tests.sh <module> <conformance_tests_folder>`. Mention only the scripts that were actually generated in Phase 3.
