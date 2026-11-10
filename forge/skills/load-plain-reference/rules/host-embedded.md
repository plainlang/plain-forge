---
description: Rules for ***plain modules whose rendered code runs inside an existing host codebase
---

# Rules for modules **embedded** in a host codebase

A module is **embedded** when the code rendered from it is consumed in-process by an existing codebase — the **host** — as a library, package, plugin, or replaced part. Two kinds of module are embedded:

- an **embedded integration** — also follow [`integration-embedded.md`](integration-embedded.md) and [`integrations.md`](integrations.md);
- a **unit captured from the host** with the `capture` skill — a part of the host's own code now described in `.plain`.

The host already exists, has its own language, framework, dependency manager, packaging layout, and conventions, and the module conforms to all of them without negotiation. If anything below contradicts a guess made from memory, the rules here win.

> **For test-script authoring**, also follow [`integration-embedded-testing.md`](integration-embedded-testing.md). It defines the per-script contract (`prepare_environment_<lang>`, `run_unittests_<lang>`, `run_conformance_tests_<lang>`) for every embedded module — staging into the host vs the system temp directory, arg validation, exit codes, output parsing, and the `***implementation reqs***` and `***test reqs***` the spec must declare so the scripts can be generated. This file only summarizes the wiring; the testing rule is the source of truth.

## The host codebase dictates the tech stack (hard rule)

- Language, framework, dependency manager, packaging layout, coding standards, error model, logging library, and architecture are **inherited** from the host — they are **never chosen** by the module's spec
- Do not ask the user about any of these — they are facts to be discovered from the host's manifest files (`pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`, …) and from the host code that plays the same role as the module
- If a tech-stack question (for example in `forge-plain` Phase 2) seems to push back on a host rule, treat the host as ground truth and rewrite the question
- Implementation reqs are **transcribed** from the host stack verbatim — host language and exact version, host framework and version, dependency manager and manifest path, packaging layout, the host conventions the module follows, and every host-package version the module pins

## Project layout — the module lives under `plain/` at the host root

The module's `.plain` specs and the rest of the ***plain project — `template/`, `resources/`, `test_scripts/`, `config.yaml`, generated `plain_modules/` — live in a single top-level `plain/` folder at the host repository root, alongside the host's own source tree:

```
<host repo>/
├── docs/
├── plain/          # ← the embedded ***plain project lives here
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

This keeps the ***plain project in one directory the user can `cd` into to render, while leaving the host's own source layout untouched.

- If the host **already** has a `plain/` directory, adopt it verbatim — see step 1 of *Discover before you ask* below
- If the host does **not** yet have one, create `plain/` at the repo root; do not invent a different name (`specs/`, `plain_specs/`, …)
- The test scripts still `cd` into `$HOST_CODEBASE_ROOT` (the host repo root) to compile and run tests against the host project; the `plain/` folder is the module's **authoring** root, not its **runtime** root

## Discover before you ask

Run host discovery **before** the first question to the user. Treat the results as ground truth for everything that follows.

1. **Locate the host's `.plain` setup (if any).** Look for existing `.plain` files (usually under `plain/`), the `config.yaml` next to them — its `template-dir`, `tests-folder`, `build-folder` (generated output, `plain_modules` by default), `build-dest`, and `*-script` keys — and the `resources/` and `test_scripts/` folders. If the host already has a `.plain` setup, **adopt it verbatim**: the new module lands next to the existing modules (or in its own part folder when it needs other test scripts) and `requires` the relevant base module when it builds on one (use `create-requires-module`). Do not create a parallel layout.
2. **Read the host code that plays the same role as the module** — the host's other integrations for an integration, the code around the captured unit for a captured unit. Extract the base class / interface / protocol it implements, package path and naming convention, configuration pattern (env vars, settings module, secret manager), error / exception hierarchy, logging / metrics / tracing conventions, and testing pattern. The module follows the same patterns unless the user explicitly opts out.
3. **Capture findings in the `host-codebase` concept.** Cite each finding by file path so the reasoning is auditable. The concept holds, as facts:
   - Host codebase root (absolute or project-relative path)
   - Host language and exact version (from the manifest file)
   - Dependency manager and manifest file path (pip + `requirements.txt`, Poetry, uv, npm, pnpm, yarn, Go modules, Cargo, Maven, Gradle, Bundler, …)
   - Package / module path inside the host where the module's code lives or is consumed
   - Fully qualified import path of any host class / interface / struct / protocol the module must conform to (e.g. `host_project.integrations.base.IntegrationContract`)
   - Host conventions (custom base classes, framework major versions, sync vs. async style, exception hierarchy, dependency-injection seams, logging library)
   - Target generated-class fully qualified name under `plain_modules/` and the host base class it subclasses, when there is one
4. **Only ask the user what the codebase cannot tell you.** Everything the host shows is a deduction. If a deduction is ambiguous (two peers subclass two different base classes), surface the ambiguity with a single-question `AskUserQuestion` that quotes both code locations — the question resolves a conflict the host already contains; it does not ask the user to design the module.

## Reference host symbols by fully qualified import path

- Every host class, interface, struct, exception, or type alias that appears in a spec must be written with its full dotted / slashed import path (e.g. `host_project.integrations.base.IntegrationContract`, `@host/integrations#Contract`) and tagged in the spec text as **"imported from the host codebase; do not redefine"**
- In a language whose path separator is `::` (Ruby, C++, Rust), a path of three or more segments contains `:Segment:`, which the parser reads as a concept reference even inside backticks. Write such a symbol as its name and the modules it is nested in, outermost first — "the class `PTOImportBuilder`, nested in `Integrations`, `Drivers`, `HRIS` and `BambooHR`" — and keep the tag
- The renderer is allowed to redefine **only** symbols the host does not provide
- Naming the symbol by FQN is not optional decoration — it tells the renderer where the type comes from, which prevents a duplicate definition under `plain_modules/`

## Copy host files into `resources/host/` — never link outside `plain/`

The renderer receives only the `plain/` project folder. A link that leaves it (`../lib/integrations/base.py`) points at nothing the renderer can read, so the spec loses that context. Every host file the module depends on is therefore **copied** into the project and linked there.

- Copy each host file the module touches (base classes, interfaces, configuration modules, registries, exception classes, lint configuration) to `resources/host/<its path in the host>` and link the copy — e.g. `lib/integrations/base.py` is copied to `resources/host/lib/integrations/base.py`. Keeping the host path below `resources/host/` makes the origin of every copy unambiguous
- **Never link a file outside `plain/`**, with `../` or an absolute path
- **A copy is a snapshot of the host file, byte for byte.** Never edit it; refresh it from the host whenever the host file changes. For a unit captured with `capture`, `capture` flags every copy whose host file changed; otherwise refresh the copies before each render
- Copy only what the renderer needs: when a large host file matters for one fact (a framework setting, a version), state the fact in the spec instead of copying the file
- **Never inline a host file's contents** into a spec, and **never describe a host symbol's shape from memory** — the renderer reads the copy, and the copy is the source of truth for the render
- The broader [`linked-resources.md`](linked-resources.md) rules still apply: a directory is not a valid link, a URL is not a valid link, a binary is not a valid link

### What else belongs under `resources/`

Artifacts the module authors for the first time — contract schemas, a configuration schema, static lookup tables, captured provider responses — live under `resources/` outside `resources/host/`, exactly like in a non-embedded project.

The rule of thumb: if the host wrote it, copy it unchanged into `resources/host/`. If the module authors it, it goes elsewhere under `resources/`.

## Single source of truth for the host root

- The `host-codebase` concept holds the host root path as a **fact**
- Test scripts, `prepare_environment`, configuration-loading specs, and any other spec that needs the host location reads it from **that one fact** (via the env var declared in the configuration concept)
- Never hardcode the host path in any spec, script, or runtime config

## No host-overlapping reqs

- Implementation reqs must not contradict the host codebase — same language, same dependency manager, same packaging layout, same error hierarchy, same logging library
- If two reqs are in tension (one from the host, one newly authored), the host wins; rewrite or drop the newly authored req
- Do not author a req that re-declares something the host already enforces — that's a maintenance burden with no benefit

## Test-script wiring — copy into the host, run tests there

Embedded modules are tested **inside the host codebase itself**. The prepare and unit-test scripts copy the renderer's output (`$1`, i.e. `plain_modules/<module>/code/`) into the host's source tree at the module's package path, then compile / test the host project in place. Only the conformance script uses a scratch folder in the system temp directory (`/tmp/<lang>_conformance/`), because the conformance suite is a separate project that consumes the host build as a dependency.

This matters because the module's generated code references host symbols by their full import path (e.g. `from host_project.integrations.base import IntegrationContract`). Those imports only resolve cleanly when the test process is rooted in the host's package layout — anything else creates path edge cases that bite later in conformance failures.

See [`integration-embedded-testing.md`](integration-embedded-testing.md) for the full per-script contract (arg validation, exit codes, idempotency, output parsing, pass criteria, cross-cutting rules). The summary that belongs in *this* file:

- **`prepare_environment_<lang>`** copies `$1` into the host's source tree at the module's package path, cleans the host's build-output directory, then runs the host's install / build (e.g. `mvn clean install -DskipTests`). The conformance suite later resolves the module from the host's local dependency cache
- **`run_unittests_<lang>`** repeats the same copy into the host (self-contained — must work without `prepare_environment` having run first), then runs the module's unit tests + lint scoped to the module's package
- **`run_conformance_tests_<lang>`** copies `$2` (the conformance-tests folder) into `/tmp/<lang>_conformance/` (system temp), `cd`s in, builds the conformance project, and runs it against the build that `prepare_environment` already installed into the host

### Invariants the scripts must enforce

- **Host root is a parameter, not a literal.** No script may hardcode an absolute host path. Read the host root from an env var (e.g. `HOST_CODEBASE_ROOT`) with a sensible default matching the user's layout (e.g. `../host_project`). Surface the env var in each script's `--help` / usage banner. Capture this env var in the module's configuration concept so it has exactly one declared name across specs, scripts, and runtime
- **Everything about `:UnitTests:` is declared in `***implementation reqs***`** — paths, approach, packages, framework, conventions. The prepare and unit-test scripts derive their copy destinations and test-filter argument from these reqs. See [`integration-embedded-testing.md`](integration-embedded-testing.md) for the exact reqs the spec must author (phrased in terms of `:UnitTests:`)
- **Everything about `:ConformanceTests:` is declared in `***test reqs***`** — paths, approach, packages, framework, execution command, pass criteria, mocking policy. The conformance script derives its build and run steps from these reqs. See [`integration-embedded-testing.md`](integration-embedded-testing.md) for the exact reqs (phrased in terms of `:ConformanceTests:`)
- **The two groups never overlap.** `:UnitTests:` facts belong only in `***implementation reqs***`; `:ConformanceTests:` facts belong only in `***test reqs***`. Neither lives in the `host-codebase` concept
- **Destructive ops are scoped to the module's own package path** under the host's source tree. `rm -rf` never touches the host's `src/main/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root. Only the module-specific package directories are wiped
- **Each script is idempotent.** Re-running the same script with the same `$1` yields the same result

## Completion checklist

Before declaring an embedded module done:

- [ ] `host-codebase` concept records host root path, host language + version, host dependency manager + manifest, target package path, host base class import path, target generated-class FQN, and the host conventions the module follows
- [ ] Every host symbol referenced in any spec uses its fully qualified import path and is tagged "imported from the host codebase; do not redefine"
- [ ] Every host file the module touches is copied to `resources/host/<its host path>`, unchanged, and linked there; no link leaves `plain/`, and no host file contents are inlined in any spec
- [ ] Tech-stack implementation reqs are transcribed verbatim from the host (no independent stack choices), including host-package version pins
- [ ] `prepare_environment` copies `$1` into the host's source tree at the module's package path, cleans the host's build-output directory, and runs the host's install / build so the conformance suite can resolve the module from the local dependency cache
- [ ] `run_unittests` runs the same copy-into-host sequence (self-contained — does not depend on `prepare_environment` having run) and invokes the host's test runner scoped to the module's package
- [ ] `run_conformance_tests` copies `$2` into `/tmp/<lang>_conformance/` (system temp), `cd`s in, builds the conformance project, and runs it against the host build that `prepare_environment` already installed
- [ ] Host codebase root is read from a named env var (default value documented in each script's usage) — never hardcoded; the env var name is captured in the module's configuration concept
- [ ] `***implementation reqs***` declares **everything about `:UnitTests:`** — module source path, `:UnitTests:` source path, `:UnitTests:` package, framework + conventions, lint / static-analysis gate — per [`integration-embedded-testing.md`](integration-embedded-testing.md)
- [ ] `***test reqs***` declares **everything about `:ConformanceTests:`** — source location, framework + execution command, package, mocking / network policy, pass criteria, build / install needs — per [`integration-embedded-testing.md`](integration-embedded-testing.md)
- [ ] Neither group is duplicated across sections: `:UnitTests:` facts never appear in `***test reqs***`, `:ConformanceTests:` facts never appear in `***implementation reqs***`, and neither lives in the `host-codebase` concept
- [ ] Every `rm -rf` in the scripts is scoped to the module's own package directory under the host's source tree — never targets the host's `src/main/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root

## Anti-patterns

- **Choosing a different language, framework, or dependency manager than the host.** The host stack is inherited; cross-stack `requires` chains are forbidden by [`requires-modules.md`](requires-modules.md)
- **Redefining a host class under `plain_modules/`.** Reference the host symbol by FQN; let the renderer import it
- **Linking a host file where it lives (`../src/...`).** The renderer receives only `plain/`; copy the file to `resources/host/<its host path>` and link the copy
- **Editing a copy under `resources/host/`, or letting it go stale.** A copy is refreshed from the host, never changed by hand; a stale copy renders against a host that no longer exists
- **Hardcoding the host codebase path in any spec or script.** Read it from the env var declared in the configuration concept
- **Asking the user to design the module's tech stack.** Read it from the host's manifest files
- **Wiring tests with `PYTHONPATH` / `NODE_PATH` / Go `replace` directives instead of physically copying `$1` into the host's package tree.** The import-stitching approach is forbidden — every prepare / unit test starts by copying the generated module into the host's source tree at the module's package path
- **Letting an `rm -rf` in a test script reach the host's `src/main/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root.** Destructive ops are scoped strictly to the module's own package directory. A wrong package path in the script silently does nothing and copies files in the wrong place — both produce a green build with stale code
- **Running conformance tests against a stale local dependency cache.** `prepare_environment` must run before conformance for the conformance project to resolve the module from `~/.m2` (or the language equivalent). If conformance gets invoked without a fresh prepare, dependent on which build last hit the cache, the suite tests the wrong code
