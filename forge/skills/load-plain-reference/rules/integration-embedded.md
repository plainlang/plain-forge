---
description: Rules for authoring ***plain specs for REST API integrations embedded into an existing host codebase
---

# Rules for **embedded** integration specs

When an integration `.plain` module is **embedded** — meaning the generated code in `plain_modules/` is consumed in-process by an existing host codebase as a library / module — these rules apply on top of the shared rules in [`integrations.md`](integrations.md). If anything below contradicts a guess made from memory, the rules here win.

Embedded means: the host codebase already exists, has its own language / framework / dependency manager / packaging layout, and the integration must conform to all of that without negotiation.

> **For test-script authoring**, also follow [`integration-embedded-testing.md`](integration-embedded-testing.md). It defines the per-script contract (`prepare_environment_<lang>`, `run_unittests_<lang>`, `run_conformance_tests_<lang>`) — staging into the host vs the system temp directory, arg validation, exit codes, output parsing, the three `***implementation reqs***` entries the spec must declare so the scripts can be generated. This file (`integration-embedded.md`) only summarizes the test-script wiring; the testing rule is the source of truth.

## The host codebase dictates the tech stack (hard rule)

- Language, framework, dependency manager, packaging layout, coding standards, error model, logging library, and architecture are **inherited** from the host — they are **never chosen** by the integration spec
- Do not re-ask the user about any of these in any phase — they are facts to be discovered from the host's manifest files (`pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `pom.xml`, …) and other integrations.
- If a Phase 3 (`forge-plain`) tech-stack question seems to push back on a host rule, treat the host as ground truth and rewrite the question
- Implementation reqs added in Phase 3 are **transcribed** from the host stack verbatim — host language and exact version, host framework + version, dependency manager and manifest path, packaging layout, host conventions the contract must follow, and every host-package version the contract pins

## Project layout — the integration lives under `plain/` at the host root

The embedded integration's `.plain` specs (and the rest of the ***plain project — `template/`, `resources/`, `test_scripts/`, `config.yaml`, generated `plain_modules/`) live in a single top-level `plain/` folder at the host repository root, alongside the host's own source tree:

```
<host repo>/
├── docs/
├── plain/          # ← the embedded ***plain integration lives here
│   ├── <module>.plain
│   ├── template/
│   ├── resources/
│   ├── test_scripts/
│   ├── plain_modules/     # generated; gitignored
│   │   └── <module>/
│   │       ├── code/      #   implementation + unit tests
│   │       └── tests/     #   conformance tests, per functional spec
│   └── config.yaml
└── src/            # host source tree (Java, Python, etc.)
```

This keeps the integration self-contained in one directory the user can `cd` into to render, while leaving the host's own source layout untouched.

- If the host **already** has a `plain/` directory, adopt it verbatim — see step 1 of *Discover before you ask* below
- If the host does **not** yet have one, create `plain/` at the repo root; do not invent a different name (`specs/`, `plain_specs/`, …)
- The three test scripts still `cd` into `$HOST_CODEBASE_ROOT` (the host repo root) to compile and run tests against the host project; the `plain/` folder is the integration's **authoring** root, not its **runtime** root

## Discover before you ask

Run host discovery **before** the first Phase 1 question. Treat the results as ground truth for everything that follows.

1. **Locate the host's `.plain` setup (if any).** Look for an existing `.plain` file or directory, a `config.yaml` declaring `plain_source_dir` / `plain_modules_dir` / `resources_dir` / `test_scripts_dir`, a `plain_modules/`, a `resources/`, and a `test_scripts/`. If the host already has a `.plain` setup, **adopt it verbatim**: the new integration module lands inside the existing `plain_source_dir` and `requires` the relevant base module (use `create-requires-module`). Do not create a parallel layout.
2. **Read every existing integration in the host.** For each one, extract: intent and scope, host base class / interface / protocol the integration subclasses or implements, package path and naming convention, configuration pattern (env vars, settings module, secret manager), error / exception hierarchy, logging / metrics / tracing conventions, testing pattern (live vs recorded vs mocked, fixture location, conformance-test layout). The new integration must follow the same patterns unless the user explicitly opts out.
3. **Capture findings in the `host-codebase` concept.** Cite the existing integration by file path so the reasoning is auditable. The concept holds, as facts:
   - Host codebase root (absolute or project-relative path)
   - Host language and exact version (from the manifest file)
   - Dependency manager and manifest file path (pip + `requirements.txt`, Poetry, uv, npm, pnpm, yarn, Go modules, Cargo, Maven, Gradle, …)
   - Package / module path inside the host where the integration will be consumed
   - Fully qualified import path of any host class / interface / struct / protocol the integration must conform to (e.g. `host_project.integrations.base.IntegrationContract`)
   - Host conventions (custom base classes, Pydantic major version, sync vs. async style, exception hierarchy, dependency-injection seams, logging library)
   - Target generated-class fully qualified name under `plain_modules/` (e.g. `plain_modules.integrations.<provider>.Client`) and the host base class it should subclass
4. **Only ask the user what the codebase cannot tell you.** The user's time goes into the third-party API itself (provider, docs, endpoints, edge cases, webhooks) and authentication / credentials. Everything else is a deduction. If a deduction is ambiguous (two existing integrations subclass two different base classes), surface the ambiguity with a single-question `AskUserQuestion` that quotes both code locations — the question is about resolving a conflict the host already contains, not about asking the user to design the integration.

## Reference host symbols by fully qualified import path

- Every host class, interface, struct, exception, or type alias that appears in a spec must be written with its full dotted / slashed import path (e.g. `host_project.integrations.base.IntegrationContract`, `@host/integrations#Contract`) and tagged in the spec text as **"imported from the host codebase; do not redefine"**
- The renderer is allowed to redefine **only** symbols the host does not provide and the contract schema does not capture
- Naming the symbol by FQN is not optional decoration — it tells the renderer where the type comes from, which prevents a duplicate definition under `plain_modules/`

## Link host files at their original path — never copy them into `resources/`

The integration's `.plain` module lives **inside the host codebase** (per the "adopt the host's `.plain` setup verbatim" step). That means host source files are already reachable as linked resources via their host-relative paths. The integration spec references them **in place**; it never duplicates them under `resources/host/`.

- Every host file the integration touches (base classes, configuration modules, registries, exception classes, lifecycle hooks) is referenced from the relevant spec using `***linked resource***` syntax with the **path as it exists in the host codebase** — e.g. `[base.py](host_project/integrations/base.py)` if the `.plain` module sits next to `host_project/`
- **Do NOT copy host files into `resources/host/`.** A copy creates a second source of truth that drifts the moment the host file is edited; the rendered code will then disagree with whatever the host actually ships
- **Do NOT add host files via the `add-resource` skill's default copy behavior** when that behavior would duplicate the file — point at the existing host path directly
- **Never inline a host file's contents** into a spec
- **Never describe a host symbol's shape from memory** — the renderer reads the linked file's bytes at its host path and that is the source of truth
- This still obeys the broader [`linked-resources.md`](linked-resources.md) rules: a directory is not a valid link, a URL is not a valid link, a binary is not a valid link. Only the *location* changes — host files live where the host put them, not under `resources/`

### What still belongs under `resources/`

This rule applies to **host source code only**. Other artifacts still live under `resources/` exactly like in a non-embedded project:

- **Contract schemas authored by the integration** — `resources/contract/<entry-point>.schema.json`
- **Configuration schema** — `resources/config.schema.json`
- **Static lookup tables** the integration owns — `resources/error-map.yaml`, `resources/retry-policy.yaml`, etc.

The rule of thumb: if the host wrote it and ships it, link it where the host put it. If the integration is authoring it for the first time, it goes under `resources/`.

## The contract spec declares inheritance, not duplication

- The entry-point class / interface / struct in the contract spec must `subclass` / `implements` / `embeds` the host symbol by its full import path
- The spec describes only the **integration-specific additions and overrides** — never restates the parent's fields or methods
- The additions and overrides are themselves expressed in the linked schema under `resources/contract/` (JSON Schema or OpenAPI), with `allOf` / `$ref` extending the host's schema rather than duplicating fields
- If a host base class adds fields the integration shouldn't redeclare, the contract schema's `allOf` chain captures that explicitly

## Renderer directives go in the spec, shapes go in the schema

Each contract spec carries the language-specific glue that the schema can't express:

- Target generated-class fully qualified name (e.g. `plain_modules.integrations.<provider>.Client`)
- Target file path under `plain_modules/`
- Host base class import path to subclass / implement
- Host-package version pins (e.g. `pydantic ~= 2.5`, `fastapi ^0.110`)
- Framework-specific decorators or metaclasses (`model_config`, `@Depends`, …)

The renderer reads the directives from the spec and the shapes from the linked schema, then emits the host-language class. The spec must **not** also contain a class body or a field list — that creates two sources of truth and they will drift.

## Single source of truth for the host root

- The `host-codebase` concept holds the host root path as a **fact**
- Test scripts, `prepare_environment`, configuration-loading specs, and any other spec that needs the host location reads it from **that one fact** (via the env var declared in the configuration concept)
- Never hardcode the host path in any spec, script, or runtime config

## No host-overlapping reqs

- Implementation reqs added in any phase must not contradict the host codebase — same language, same dependency manager, same packaging layout, same error hierarchy, same logging library
- If two reqs are in tension (one from the host, one newly authored), the host wins; rewrite or drop the newly authored req
- Do not author a req that re-declares something the host already enforces — that's a maintenance burden with no benefit

## Test-script wiring — copy into the host, run tests there

Embedded integrations are tested **inside the host codebase itself**. The prepare and unit-test scripts copy the renderer's output (`$1`, i.e. `plain_modules/<module>/code/`) into the host's source tree at the module's package path, then compile / test the host project in place. Only the conformance script uses a scratch folder in the system temp directory (`/tmp/<lang>_conformance/`), because the conformance suite is a separate project that consumes the host build as a dependency.

This matters because the integration's generated code references host symbols by their full import path (e.g. `from host_project.integrations.base import IntegrationContract`). Those imports only resolve cleanly when the test process is rooted in the host's package layout — anything else creates path edge cases that bite later in conformance failures.

See [`integration-embedded-testing.md`](integration-embedded-testing.md) for the full per-script contract (arg validation, exit codes, idempotency, output parsing, pass criteria, cross-cutting rules). The summary that belongs in *this* file:

- **`prepare_environment_<lang>`** copies `$1` into the host's source tree at the module's package path, cleans the host's build-output directory, then runs the host's install / build (e.g. `mvn clean install -DskipTests`). The conformance suite later resolves the integration from the host's local dependency cache
- **`run_unittests_<lang>`** repeats the same copy into the host (self-contained — must work without `prepare_environment` having run first), then runs the module's unit tests + lint scoped to the module's package
- **`run_conformance_tests_<lang>`** copies `$2` (the conformance-tests folder) into `/tmp/<lang>_conformance/` (system temp), `cd`s in, builds the conformance project, and runs it against the build that `prepare_environment` already installed into the host

### Invariants the scripts must enforce

- **Host root is a parameter, not a literal.** No script may hardcode an absolute host path. Read the host root from an env var (e.g. `HOST_CODEBASE_ROOT`) with a sensible default matching the user's layout (e.g. `../host_project`). Surface the env var in each script's `--help` / usage banner. Capture this env var in the integration's configuration concept so it has exactly one declared name across specs, scripts, and runtime
- **Everything about `:UnitTests:` is declared in `***implementation reqs***`** — paths, approach, packages, framework, conventions. The prepare and unit-test scripts derive their copy destinations and test-filter argument from these reqs. See [`integration-embedded-testing.md`](integration-embedded-testing.md) for the exact reqs the spec must author (phrased in terms of `:UnitTests:`)
- **Everything about `:ConformanceTests:` is declared in `***test reqs***`** — paths, approach, packages, framework, execution command, pass criteria, mocking policy. The conformance script derives its build and run steps from these reqs. See [`integration-embedded-testing.md`](integration-embedded-testing.md) for the exact reqs (phrased in terms of `:ConformanceTests:`)
- **The two groups never overlap.** `:UnitTests:` facts belong only in `***implementation reqs***`; `:ConformanceTests:` facts belong only in `***test reqs***`. Neither lives in the `host-codebase` concept
- **Destructive ops are scoped to the module's own package path** under the host's source tree. `rm -rf` never touches the host's `src/main/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root. Only the module-specific package directories are wiped
- **Each script is idempotent.** Re-running the same script with the same `$1` yields the same result

## Embedded-specific completion checklist

Before declaring an embedded integration done, in addition to the shared checklist in [`integrations.md`](integrations.md):

- [ ] `host-codebase` concept records host root path, host language + version, host dependency manager + manifest, target package path, host base class import path, target generated-class FQN, and the host conventions the contract follows
- [ ] Contract spec carries renderer directives (target language, target file path, target class name, host base class to subclass, host-package pins) and **links** to the contract schema; no class body is inlined
- [ ] Every host symbol referenced in any spec uses its fully qualified import path and is tagged "imported from the host codebase; do not redefine"
- [ ] Every host file the integration touches is linked at its **original host-relative path** — no host file has been copied into `resources/host/` or anywhere else, and no host file contents are inlined in any spec
- [ ] `forge-plain` Phase 2's tech-stack decisions are transcribed verbatim from the host (no independent stack choices)
- [ ] Host-package version pins are copied into `***implementation reqs***`
- [ ] `prepare_environment` copies `$1` into the host's source tree at the module's package path, cleans the host's build-output directory, and runs the host's install / build so the conformance suite can resolve the integration from the local dependency cache
- [ ] `run_unittests` runs the same copy-into-host sequence (self-contained — does not depend on `prepare_environment` having run) and invokes the host's test runner scoped to the module's package
- [ ] `run_conformance_tests` copies `$2` into `/tmp/<lang>_conformance/` (system temp), `cd`s in, builds the conformance project, and runs it against the host build that `prepare_environment` already installed
- [ ] Host codebase root is read from a named env var (default value documented in each script's usage) — never hardcoded; the env var name is captured in the integration's configuration concept
- [ ] `***implementation reqs***` declares **everything about `:UnitTests:`** — integration source path, `:UnitTests:` source path, `:UnitTests:` package, framework + conventions, lint / static-analysis gate — per [`integration-embedded-testing.md`](integration-embedded-testing.md)
- [ ] `***test reqs***` declares **everything about `:ConformanceTests:`** — source location, framework + execution command, package, mocking / network policy, pass criteria, build / install needs — per [`integration-embedded-testing.md`](integration-embedded-testing.md)
- [ ] Neither group is duplicated across sections: `:UnitTests:` facts never appear in `***test reqs***`, `:ConformanceTests:` facts never appear in `***implementation reqs***`, and neither lives in the `host-codebase` concept
- [ ] Every `rm -rf` in the scripts is scoped to the module's own package directory under the host's source tree — never targets the host's `src/main/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root

## Anti-patterns specific to embedded integrations

- **Choosing a different language, framework, or dependency manager than the host.** The host stack is inherited; cross-stack `requires` chains are forbidden by [`requires-modules.md`](requires-modules.md)
- **Redefining a host class under `plain_modules/`.** Reference the host symbol by FQN; let the renderer import it
- **Inlining a host base class body into the contract spec.** Reference the host file as a linked resource **at its original host-relative path** — do not inline its contents and do not copy it into `resources/`
- **Copying host source files into `resources/host/` (or anywhere under `resources/`).** That creates a second source of truth that silently drifts from the host. Link the host file in place; the integration `.plain` module already lives inside the host codebase, so the path resolves naturally
- **Hardcoding the host codebase path in any spec or script.** Read it from the env var declared in the configuration concept
- **Asking the user to design the integration's tech stack.** Read it from the host's manifest files
- **Authoring an integration spec that contradicts an existing integration in the same host** without first surfacing the conflict and getting explicit user confirmation
- **Wiring tests with `PYTHONPATH` / `NODE_PATH` / Go `replace` directives instead of physically copying `$1` into the host's package tree.** The import-stitching approach is forbidden — every prepare / unit test starts by copying the generated module into the host's source tree at the module's package path
- **Letting an `rm -rf` in a test script reach the host's `src/main/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root.** Destructive ops are scoped strictly to the module's own package directory. A wrong package path in the script silently does nothing and copies files in the wrong place — both produce a green build with stale code
- **Running conformance tests against a stale local dependency cache.** `prepare_environment` must run before conformance for the conformance project to resolve the integration from `~/.m2` (or the language equivalent). If conformance gets invoked without a fresh prepare, dependent on which build last hit the cache, the suite tests the wrong code
