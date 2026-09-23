---
description: Rules for authoring the three test scripts that an embedded ***plain integration ships
---

# Rules for embedded-integration test scripts

When an embedded integration ships its three `test_scripts/` (prepare-environment, unit,
conformance), these rules apply on top of the contracts in the corresponding
`implement-*-testing-script` skills. Use `load-plain-reference` for the rendering and testing
workflow overview when needed.

## Staging model (read this first)

The three scripts do **not** all stage into the same place. Embedded integrations need a runnable host project, so the prepare and unit-test scripts operate **inside the host codebase itself**; only the conformance script uses a scratch folder in the system temp directory (`/tmp/<lang>_conformance/`) because the conformance suite lives in a separate project.

| Script | Where it operates | What it does to the host source tree |
|--------|-------------------|---------------------------------------|
| `prepare_environment_<lang>` | Inside the host codebase | Copies `$1` into the module's package path under the host's source tree, then compiles / installs the host project |
| `run_unittests_<lang>` | Inside the host codebase | Same copy as above (self-contained), then runs the module's unit tests + lint inside the host |
| `run_conformance_tests_<lang>` | `/tmp/<lang>_conformance/` (system temp) | Copies `$2` (the conformance-tests folder) into the scratch directory and runs the conformance suite there, which depends on the host build that `prepare_environment` already installed |

This deliberately writes into the host's `src/main/...` and `src/test/...` (or the language equivalent). Two consequences flow from that:

- **The host codebase root must come from a configured env var** (`HOST_CODEBASE_ROOT` is the conventional name; declare it in the integration's configuration concept). Scripts never hardcode it
- **The destructive-op scoping rule below becomes critical.** `rm -rf` must target only the module's own package path under the host's source tree, never the host's `src/main/`, `target/`, `node_modules/`, or `build/` at the project root

This rule covers the **mechanics each script must obey** regardless of language: argument handling, exit codes, idempotency, path resolution, output parsing, and the "what NOT to put here" guard rails. The language-specific install / test commands come from the skills; the contract below is invariant.

## What the `.plain` spec must declare

The three scripts are generated from facts in the integration's spec. For an embedded integration, those facts cannot be inferred — they have to be **declared explicitly** in the right section, partitioned by which predefined concept they describe:

- **Everything about `:UnitTests:`** — paths, approach, packages, framework, conventions, fixtures, mocking policy — lives in `***implementation reqs***`. Unit tests are part of the generated codebase, so requirements that shape them are implementation reqs (see [`impl-reqs.md`](impl-reqs.md))
- **Everything about `:ConformanceTests:`** — paths, approach, packages, framework, execution command, pass criteria, mocking policy — lives in `***test reqs***`. Conformance tests are external to the generated codebase, so requirements that shape them are test reqs (see [`test-reqs.md`](test-reqs.md))

Authors use `add-implementation-requirement` for the first group and `add-test-requirement` for the second. The two groups are parallel — each predefined concept owns a complete authoring story in its own section.

### In `***implementation reqs***` — everything about `:UnitTests:`

These reqs feed `run_unittests_<lang>`. `prepare_environment_<lang>` is **not** part of the unit-test workflow — it exists for conformance (see the next subsection) and reads its own facts from `***test reqs***`. At minimum, declare:

1. **Integration source path inside the host** — where `$1/<source>/*` gets copied to. Example: `src/main/java/com/example/integrations/foo`
2. **`:UnitTests:` source path inside the host** — where `$1/<tests>/*` gets copied to, and where the test runner discovers unit tests. Example: `src/test/java/com/example/integrations/foo`
3. **Fully qualified `:UnitTests:` package** — the package the test runner uses to scope discovery via its filter argument. Example: `com.example.integrations.foo`
4. **`:UnitTests:` framework and conventions** — JUnit / pytest / Jest / Go's `testing` / etc., plus naming conventions (`*Test`, `test_*`, `*.test.ts`, …), fixture / mock / assertion style, file layout inside the test package
5. **Quality gates that run alongside `:UnitTests:`** — Checkstyle / ESLint / Pylint / Ruff / `go vet` / `cargo clippy` — whatever the host project requires

Author the location facts as one tight group, phrased in terms of `:UnitTests:`:

```plain
- :UnitTests: of :Implementation: live in `src/test/java/com/example/integrations/foo` inside the host codebase.
  - The corresponding integration source code lives in `src/main/java/com/example/integrations/foo`.
  - The fully qualified package used for :UnitTests: discovery is `com.example.integrations.foo`.
  - :UnitTests: use JUnit 5 with the host's Checkstyle profile applied via `mvn checkstyle:check`.
```

These facts feed directly into the prepare and unit-test script bodies:

```bash
# clean existing code from the host
rm -rf $MAIN_PROJECT_FOLDER/<integration source path>/*
rm -rf $MAIN_PROJECT_FOLDER/<:UnitTests: source path>/*

# create destinations and copy generated code into the host
mkdir -p $MAIN_PROJECT_FOLDER/<integration source path>
mkdir -p $MAIN_PROJECT_FOLDER/<:UnitTests: source path>
cp -R $1/<integration source path>/* $MAIN_PROJECT_FOLDER/<integration source path>
cp -R $1/<:UnitTests: source path>/* $MAIN_PROJECT_FOLDER/<:UnitTests: source path>

# run :UnitTests: scoped to the integration's package
mvn test -Dtest='<:UnitTests: package>.**.*Test' checkstyle:check
```

### In `***test reqs***` — everything about `:ConformanceTests:`

These reqs feed `run_conformance_tests_<lang>`. At minimum, declare:

1. **`:ConformanceTests:` source location** — the generated suite lives under `plain_modules/<module>/tests/`, one folder per functional spec; the renderer passes the resolved path of the folder under test as `$2`
2. **`:ConformanceTests:` framework and execution command** — `mvn test --no-transfer-progress`, `pytest`, `npm test`, `go test ./...`, etc., with any flags / profiles the project requires
3. **Fully qualified `:ConformanceTests:` package** (or path / pattern) used to scope discovery, if the runner needs one
4. **`:ConformanceTests:` network and secrets policy** — by default the suite runs against the **live provider** (see [`integrations.md`](integrations.md) → *`:ConformanceTests:` always run against the live integration*). Declare the env-var names the script reads (e.g. `<PROVIDER>_API_KEY`), whether the script loads a `.env` file before running, and any specific endpoints that are mocked because they can't be exercised live safely (429, forced 5xx)
5. **`:ConformanceTests:` pass criteria** — the strict criteria from [*Pass criteria (strict)*](#pass-criteria-strict): at least one test ran AND zero failures / errors / skipped. Reaffirm this in the spec so the renderer knows the runner must parse the test tool's stdout
6. **`:ConformanceTests:` build / install needs** — anything the conformance project needs before `mvn test` (or equivalent) will work: dependencies, fixtures, schema files, generated stubs

Author the conformance facts as one or more entries, phrased in terms of `:ConformanceTests:`:

```plain
- :ConformanceTests: of :Implementation: live in `plain_modules/foo/tests/` and are implemented with JUnit 5 + Maven.
  - The fully qualified package used for :ConformanceTests: discovery is `com.example.integrations.foo.conformance`.
  - :ConformanceTests: are run via `mvn test --no-transfer-progress`; the host's Surefire plugin must be installed.
  - :ConformanceTests: run against the live :ProviderName: sandbox — no mocking of provider calls.
  - The conformance script reads `<PROVIDER>_API_KEY` (and any additional secrets) from the shell or from a `.env` file at the project root and fails fast (exit `69`) if any required var is missing after the optional `.env` load.
  - The 429 (rate-limit) and forced-5xx paths use a local mock for that specific endpoint; every other path is live.
  - :ConformanceTests: pass only when the Surefire summary line shows at least one test ran with zero failures, zero errors, and zero skipped.
```

These facts feed directly into the conformance script body:

```bash
# stage :ConformanceTests: source into the scratch directory
find "$DIR" -mindepth 1 -exec rm -rf {} +
cp -R $2/* $DIR
cd $DIR

# build the conformance project, then run :ConformanceTests:
mvn clean install -DskipTests
output=$(mvn test --no-transfer-progress 2>&1)

# parse Surefire summary against the declared pass criteria, then exit accordingly
```

### Rules common to both sections

- **The paths must agree across reqs.** The `:UnitTests:` source path, the `:UnitTests:` package, and the integration source path describe the same module from three angles. Same for the `:ConformanceTests:` location and its package. A mismatch (e.g. test path `src/test/java/com/example/foo` but test package `com.example.bar`) silently produces a green build with stale or zero tests
- **Paths are host-relative**, not absolute. `MAIN_PROJECT_FOLDER` comes from `HOST_CODEBASE_ROOT` (declared in the configuration concept); the paths above join onto it
- **The renderer's output folder `$1` mirrors the same layout.** `$1/<integration source path>/*` exists because the renderer emits the generated code into the same package directories it'll be copied into — the `cp -R` is a straight overlay, not a path translation
- **Each fact lives in one place.** If two `***implementation reqs***` entries declare slightly different `:UnitTests:` paths (or two `***test reqs***` entries declare slightly different `:ConformanceTests:` packages), the renderer can't tell which to use. Author each group as a tight cluster (one bullet with sub-bullets) so a future reviewer sees them together
- **Never duplicate a fact across sections.** `:UnitTests:` facts belong **only** in `***implementation reqs***`; `:ConformanceTests:` facts belong **only** in `***test reqs***`. The two groups never overlap — the script generators read each from its own section
- **For non-Java languages**, the facts have language-specific equivalents — Python: `src/foo/`, `tests/foo/`, `tests.foo`; Node: `src/foo/`, `test/foo/`, `test/foo/**/*.test.ts`. The `implement-*-testing-script` skills know the mapping per language, but the spec still has to declare the host-relative paths and packages so the skill knows what to put in the script bodies

## Common contract (all three scripts)

All three scripts are invoked by the renderer with positional arguments. They MUST:

1. **Be POSIX-bash (`.sh`) on macOS / Linux, PowerShell (`.ps1`) on Windows.** Executable, idempotent — re-running with the same inputs produces the same result
2. **Validate every positional argument up front.** Exit with a clear `Usage:` line on bad args. Conventional exit codes (consistent with the shared testing-script rules):
   - `1` — bad arguments / usage error (and "no tests discovered" for the conformance runner)
   - `2` — missing or inaccessible input folder
   - `69` — unrecoverable environment failure (missing toolchain, cannot enter working folder, install failed)
   - Any other non-zero code — propagated verbatim from the underlying build / test tool

   The renderer passes `$1` (and `$2` for the conformance runner) as **absolute paths** (older renderer versions passed relative ones). Never build a derived path by concatenating a raw argument (`.tmp/$1`, `<lang>_$1`, `$current_dir/$2`) — with an absolute argument that produces a doubled path (`/project//abs/path/...`). Use the argument as-is where a path is needed, take its `basename` when naming a scratch folder, and resolve `$2` to absolute (if it isn't already) before any `cd`
3. **Echo the toolchain home at the top** — the first thing a developer checks when CI breaks. For Java: `JAVA_HOME`. For Python: the active interpreter (`python --version` / `which python`). For Node: `node --version`. For Go: `go env GOROOT`. Pick the variable whose value most often explains "why does it work locally but not on the CI runner?"
4. **Respect `VERBOSE=1`.** Gate chatty diagnostic prints behind `if [ "${VERBOSE:-}" = "1" ]` (and the PowerShell equivalent). Errors and key step markers print unconditionally
5. **Resolve paths relative to the script, not `$PWD`.** Use `"$(cd "$(dirname "$0")/<relative-path-to-anchor>" && pwd)"`. Hard-coded `../../` chains break the moment the renderer's `cwd` changes
6. **Create destination directories before copying.** `mkdir -p` before any `cp -R` / `rsync` / `robocopy` — most copy commands do not create intermediate directories and fail silently in some shells
7. **Scope destructive operations narrowly.** Any `rm -rf` (or `Remove-Item -Recurse -Force`) targets only the module's own package path inside the working folder — never the host's `src/`, `target/`, `node_modules/`, `build/`, or `dist/` at the project root. Only `prepare_environment` owns the build-output directory's lifecycle for its system-temp working folder
8. **Print where you are before you `cd`.** `echo "Moving to: $DIR"` saves an hour of debugging when paths are wrong. PowerShell: `Write-Host "Moving to: $DIR"`

## 1. `prepare_environment_<lang>` — copy into the host, then compile

Receives one positional argument: the renderer's build output folder (e.g. `plain_modules/<module>/code/`).

Purpose: stage the generated code **into the host codebase at the module's package path**, then run the host's install / build so that downstream test projects (specifically the conformance suite) can depend on it from the local dependency cache.

Required steps:

1. Validate `$1` (the renderer's output folder); fail with usage if missing
2. Resolve the host codebase root from the env var declared in the `host-codebase` concept (`HOST_CODEBASE_ROOT` is the conventional name; surface it in `--help` / usage)
3. `rm -rf` the module's package directories under the host's source tree — both main / source AND test directories. Both, because stale tests in the target package cause confusing failures
4. `mkdir -p` the destination directories
5. Copy `$1/src/...` (or the language-equivalent layout) into the host's source tree at the module's package path
6. `cd` into the host codebase root, verify with an explicit exit-code check (`if [ $? -ne 0 ]` / `if (! $?) { ... }`)
7. Clean the host's build-output directory before compiling — stale class / object files from a previous build cause confusing link-time mismatches when the contract has changed. Maven: `rm -rf ./target`. Cargo: `cargo clean -p <pkg>`. Go: `go clean -cache` (usually unnecessary, but mention if applicable). For npm projects with incremental builds disabled, wipe the relevant `dist/` / `build/` folder
8. Run the host's standard install / build command — but **skip the fat-artifact and skip tests** when the build system supports it:
   - Maven: `mvn clean install -DskipTests` (plus any host-specific repackage-skip flag)
   - npm / pnpm / yarn: `npm ci` (no test script; dependency install only)
   - Python: `pip install -e .` (then any extra integration dependencies)
   - Go: `go mod tidy && go build ./...`
   - Cargo: `cargo fetch && cargo build --tests --no-run`
9. Exit `0` on success; propagate the underlying build tool's exit code on failure

**Why this script exists separately.** Conformance tests live in a separate project and resolve the integration's code as a dependency from a local cache (`~/.m2`, `node_modules`, the language equivalent). Without an explicit install step, conformance tests link against whatever was last built — which may not be the renderer's most recent output.

## 2. `run_unittests_<lang>` — copy into the host, then run unit tests there

Receives one positional argument: the renderer's build output folder.

Purpose: stage the generated code **into the host codebase** (the same way `prepare_environment` does) and run the module's unit tests + language-appropriate quality gates against the host project from inside the host root.

Required steps:

1. Validate `$1`
2. Resolve the host codebase root from the configured env var
3. `rm -rf` the module's main + test package directories under the host's source tree
4. `mkdir -p` and copy `$1/src/...` into place — **same staging as `prepare_environment`**
5. `cd` into the host codebase root
6. Run the test command **scoped to the module's package only**:
   - Maven: `mvn test -Dtest='<fully.qualified.package>.**.*Test' <lint-check>:check`
   - pytest: `pytest tests/<module>/` (or whatever path matches the module)
   - Jest: `npm test -- --testPathPattern '<module>/'`
   - Go: `go test ./<module>/...`
7. Always include the host's lint / static-analysis gate in the same invocation when the build system has one (Checkstyle, ESLint, Pylint / Ruff, `go vet`, `cargo clippy`, …). Running tests without the lint gate produces a false-green when style violations would otherwise block the build

Hard rules:

- **Yes, this duplicates `prepare_environment`'s copy step.** That's intentional — `run_unittests` must be self-contained per the shared testing-script rules (there is no activate-only variant for unit tests). A user invoking the unit-test script independently must not need `prepare_environment` to have run first
- **Never use a "clean and test" shortcut** (`mvn clean test`, `npm run rebuild`, …) — the cleanup belongs in `prepare_environment` and would erase whatever it installed
- **Never run the full test suite** when scoping is possible. A per-module script that runs the entire host's tests wastes minutes on every render iteration

## 3. `run_conformance_tests_<lang>` — copy into the system temp directory, then run the external suite

Receives two positional arguments: the renderer's build output folder (`$1`) and the conformance-tests folder (`$2`).

Purpose: run the conformance suite in `$2` against the build that `prepare_environment` produced. The conformance suite is a separate project that consumes the integration as a dependency.

Required steps:

1. Validate `$1` and `$2`. **Only `$2` is actually used by the script body today** — but keep `$1` in the signature; the renderer passes both positionally. Resolve `$2` to an absolute path if it isn't one already (newer renderers pass it absolute; older ones passed it relative to the invocation directory)
2. Stage `$2/*` into a scratch directory in the system temp directory (`/tmp/<lang>_conformance/` in Bash, the `GetTempPath()` equivalent in PowerShell). Wipe it first if it exists, and remove it again on exit (`trap 'rm -rf "$DIR"' EXIT` / `finally`). Use a deletion form that handles hidden files and odd shells safely:
   - Bash: `find "$DIR" -mindepth 1 -exec rm -rf {} +` (safer than `rm -rf "$DIR"/*`)
   - PowerShell: `Remove-Item -Recurse -Force "$DIR\*"` after confirming the path exists
3. `cd` into the scratch directory
4. Compile / set up the conformance project — exit early if this fails:
   - Maven: `mvn clean install -DskipTests`
   - npm: `npm ci`
   - Python: `pip install -r requirements.txt`
   - Go / Cargo: standard build
5. Run the conformance test command and **capture stdout to a variable**:
   - Bash: `output=$(mvn test --no-transfer-progress 2>&1)` (or the language equivalent)
   - PowerShell: `$output = & <cmd> 2>&1 | Out-String`
6. **Parse the captured output strictly** (see *Pass criteria* below) — don't trust the test tool's exit code alone
7. On the failure path: print the captured output unconditionally so the renderer (and the user) can see what failed
8. On the success path: print the output only if `VERBOSE=1`

### Secrets and `.env` handling

`:ConformanceTests:` run against the live provider (per [`integrations.md`](integrations.md) → *`:ConformanceTests:` always run against the live integration*), so the conformance script needs the user's credentials at runtime.

- **Credentials are read from environment variables** named in `***test reqs***` and the auth concept. Never from a literal, never from a file checked into the repo
- **The script may optionally load a `.env` file** before running the suite. Typical pattern in Bash:

  ```bash
  ENV_FILE="${ENV_FILE:-$MAIN_PROJECT_FOLDER/.env}"
  if [ -f "$ENV_FILE" ]; then
      echo "Loading env from $ENV_FILE"
      set -a; . "$ENV_FILE"; set +a
  fi
  ```

  PowerShell uses the equivalent `Get-Content` + `Set-Item Env:` loop. Absence of `.env` is **not** an error — CI provides the same vars directly through the shell
- **Verify required env vars exist after the optional `.env` load** and fail fast if any are missing:

  ```bash
  for var in PROVIDER_API_KEY PROVIDER_ACCOUNT_ID; do
      if [ -z "${!var:-}" ]; then
          printf "Error: %s is required for :ConformanceTests:\n" "$var" >&2
          exit 69
      fi
  done
  ```

- **Export the resolved vars** (already in scope thanks to `set -a`) so child processes started by the test runner inherit them — Maven, pytest, npm, Go all read env vars from their parent process
- **Never log credential values.** Echo the env-var **name** when reporting "loaded", not its value. Redact in any error path that dumps captured output
- **Document the secret names twice** — once in the auth concept (for the runtime), once in `***test reqs***` for `:ConformanceTests:` (for the script). They must be the same names; a divergence means the script reads different credentials than the runtime does, and conformance silently tests the wrong account

### Pass criteria (strict)

These are the **only** valid pass criteria. Anything outside this list is a failure:

- At least one test ran AND zero failures AND zero errors AND zero skipped. Maven example: `Tests run: [1-9][0-9]*, Failures: 0, Errors: 0, Skipped: 0`. Each language's test runner has an equivalent summary line — match it with a regex, not by substring
- Exit with the test tool's exit code on the success path (almost always `0`)

Failure cases — each must be detected explicitly:

- `Tests run: 0` (or the language equivalent) → **failure**. The renderer must never be told "green" when nothing ran. Exit `1` per the shared testing-script rules (the "no tests discovered" exit code)
- Any non-zero `Failures:`, `Errors:`, or `Skipped:` count → **failure**. Dump the captured output and propagate the test tool's exit code
- The test tool exited non-zero but the summary line shows `Tests run: 0` → still a `1` (no-tests-discovered), not the tool's own exit code

**Why parse stdout instead of trusting the test tool's exit code.** Every major test runner returns `0` when zero test classes match a filter. Maven Surefire, pytest with no collected tests, `go test ./pkg/that/has/no/_test.go/files`, Jest with an empty pattern — all green-by-default. The renderer's contract is "tests must run AND must pass" — the exit code alone cannot express that.

## Cross-cutting rules

- **No secrets in scripts.** Read credentials from env vars the renderer (or the user's shell) already sets. If a required env var is missing, fail fast with a clear `Error: $FOO is required for ...` and exit `69`. Never hardcode an API key, never read from a checked-in file
- **Mirror the package / module path exactly.** A typo in the package segment (e.g. one wrong directory in `com/example/foo/...` or `host_pkg/foo/bar/...`) makes `rm -rf` silently do nothing and the subsequent copy put files in the wrong place. Both produce a **green** build with stale code. Derive the package path from the `host-codebase` concept; never retype it inline
- **Don't add cleverness to the script that belongs in the build.** If you're tempted to `grep` the test output for more than the pass/fail summary, change the test or the test-runner config instead. The script is a thin contract — keep it that way
- **Don't use shortcut profiles that skip quality gates.** Maven's `-Pfast`, Gradle's `-x check`, npm's `--ignore-scripts`, pytest's `--no-cov`, `-DskipTests` outside `prepare_environment` — all defeat the purpose of these scripts. The build's full quality gate (tests + lint + coverage thresholds) must run for unit and conformance
- **Failure messages are for humans.** `printf "Error: <what failed> at <where>\n"` then exit with the right code. No silent failures, no `|| true` to paper over errors, no `2>/dev/null` on commands whose stderr matters
- **Use existing scripts as templates.** When you add a new embedded integration, copy from a known-good module, then search-and-replace only the package path and the test-filter argument. Resist the urge to "improve" structure mid-port — pattern-matching across many modules is a feature, not a bug

## Reference implementation (Java + Maven)

A working three-script set for a Java / Maven embedded integration lives under [`examples/integration-embedded-testing/`](examples/integration-embedded-testing/) next to this file:

- [`prepare_environment_java.sh`](examples/integration-embedded-testing/prepare_environment_java.sh) — copies `$1` into the host's source tree, cleans `target/`, runs `mvn clean install -DskipTests`
- [`run_unittests_java.sh`](examples/integration-embedded-testing/run_unittests_java.sh) — re-stages into the host and runs `mvn test -Dtest='<module-pkg>.**.*Test' checkstyle:check`
- [`run_conformance_tests_java.sh`](examples/integration-embedded-testing/run_conformance_tests_java.sh) — copies `$2` into `/tmp/java_conformance/` (system temp, removed again on exit), builds the conformance project, runs the suite, and parses the Surefire summary line per the strict pass criteria above

Use them as a template when adding a new embedded integration in Java / Maven — copy, search-and-replace only the package segment and the `-Dtest` filter, then wire into `config.yaml`. For other languages (Python, Node.js, Go, Rust, …), the `implement-*-testing-script` skills generate the equivalent three-script set following the same contract.

## Adding a script for a new module

1. Copy the three scripts from a working embedded-integration module into the new module's directory
2. Search-and-replace the package segment everywhere it appears — including the test-filter argument (the most commonly missed spot)
3. `chmod +x` all three (and verify ACLs on Windows for the `.ps1` siblings)
4. Wire them into the module's `config.yaml` via the `unittests-script`, `conformance-tests-script`, and `prepare-environment-script` keys. Use `init-config-file` to assemble the canonical form
5. Smoke-test by running each script manually with the renderer's output folder as `$1` (and the conformance-tests folder as `$2` for the conformance runner). Confirm exit codes match what the renderer expects

For non-Java languages, the plain-forge skills [`implement-prepare-environment-script`](../skills/implement-prepare-environment-script/SKILL.md), [`implement-unit-testing-script`](../skills/implement-unit-testing-script/SKILL.md), and [`implement-conformance-testing-script`](../skills/implement-conformance-testing-script/SKILL.md) adapt the contract above to Python, Node.js, Go, Rust, Flutter, and others. Always route script creation through these skills so the cross-cutting rules above are applied uniformly.
