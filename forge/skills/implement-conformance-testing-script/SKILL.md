---
name: implement-conformance-testing-script
description: >-
  Implement a conformance-test runner script (Bash on macOS/Linux, PowerShell on
  Windows) for an arbitrary programming language, in one of two variants:
  install-inline (when no prepare_environment_<lang> script exists) or
  activate-only (when one does). Use when the user wants to add a
  conformance-test runner for a new language (Node.js, Go, Rust, Flutter, etc.)
  to a ***plain project, or wants to regenerate / adapt one of the existing
  runners.
---

# Implement Conformance Testing Script

This skill produces a single executable script that runs the **conformance tests** for a generated build folder, following a consistent, language-agnostic pattern.

The reference implementations are:

- [assets/run_conformance_tests_java.sh](assets/run_conformance_tests_java.sh) — Java, install-inline variant.
- [assets/run_conformance_tests_python.sh](assets/run_conformance_tests_python.sh) — Python, install-inline variant.
- [assets/run_conformance_tests_<lang>.ps1](assets/run_conformance_tests_*.ps1) — Windows PowerShell equivalents.

Read both before writing anything — every script you produce must be a faithful translation of the same pattern into the target language's tooling **and** the user's shell environment.


## How conformance scripts differ from unit-test scripts

A conformance script is structurally very close to a unit-test script (see the sibling skill [`implement-unit-testing-script`](../implement-unit-testing-script/SKILL.md)) but with two important differences:

1. **Two positional arguments instead of one.** A conformance script takes both the **build folder** (source under test) and a **separate conformance tests folder** (the tests to execute against that build). Both arrive as **absolute paths** from current renderers (older renderer versions passed relative ones) — the script must work with both.
2. **Tests are loaded from outside the working folder.** The build is staged into the working folder `<temp>/<lang>_<basename>` (system temp directory + language id + basename of `$1` — see [Conventions](#conventions)) and the script `cd`s into it, but the test command is pointed at the conformance tests folder, resolved to an **absolute path** up front (`$CONFORMANCE_TESTS_FOLDER` below). Tests are never copied into the staging area.

Everything else — toolchain check, build staging, dependency isolation, exit codes — is the same.

## Variant decision: install-inline vs. activate-only

**Before writing anything, decide which variant to emit.** Both variants share toolchain check, arg validation, cwd capture, test execution, and exit-code handling — they differ only in the middle (steps 4–7 of [the pattern](#the-pattern) below).

| Look for an existing | Emit |
|---|---|
| `prepare_environment_<lang>.sh` / `.ps1` in the project's `test_scripts/` folder (or wherever `config.yaml`'s `prepare-environment-script:` key points) | **Activate-only variant.** Verifies the prepared env, activates it, and runs tests. **Does not** stage the build or install deps — prepare already did. |
| Nothing — no prepare script | **Install-inline variant.** Stages the build, installs deps, and runs tests in one shot. |

### Why this split exists

The conformance runner is invoked **once per functional spec** by the renderer. Each functional spec in a module has its own `plain_modules/<module>/tests/<spec>/` folder, and after the renderer finishes generating code for a new spec, it runs the conformance tests of **every previous spec** in the same module to detect regressions. For a module with N functional specs, this script is called **on the order of N times per render** — not once per render.

That per-spec invocation pattern is what makes the install step expensive. A naive runner that does `pip install` / `npm ci` / `mvn install -DskipTests` / `cargo build` on every invocation pays the install cost N times per render. For anything beyond a toy project, that cost dominates wall-clock time.

The two variants are a direct response to this:

- **Install-inline** is correct only when N is small (a few specs) or dependencies are cheap. It is self-contained: stage, install, run, repeat from scratch every invocation.
- **Activate-only** is the production answer. [`prepare_environment_<lang>`](../implement-prepare-environment-script/SKILL.md) runs **once per render** and pays the install cost a single time, populating `<temp>/<lang>_<basename>/` with the warmed environment. Each of the N conformance invocations then just **attaches** to that working folder and runs the tests — no install, no compile, just activate-and-go.

**The cleanup contract follows from this split:** the **install-inline** variant owns its working folder and removes it on exit (`trap 'rm -rf "$WORKING_FOLDER"' EXIT` / `Remove-Item` in `finally`). The **activate-only** variant **never deletes the working folder** — not on success, not on failure. Prepare owns that folder's lifecycle; if activate-only deleted it, the second of the N invocations would fail the "prepared environment missing" guard and the amortization would be destroyed.

**Why picking the right variant matters:** if you emit the install-inline variant alongside an existing prepare script, prepare's work is wiped (by the script's staging `rm -rf` and its exit cleanup) or duplicated (by re-running install) on every run — defeating prepare's whole purpose. Conversely, emitting activate-only without a prepare script means the "verify prepared environment" check fails on every run because nothing has populated the working folder. See [Anti-Patterns](#anti-patterns).

## Pick the Shell First

Before writing anything, decide which shell flavor the script must target — it depends on the user's environment, not on the language:

- **Bash (`.sh`)** — macOS, Linux, WSL, CI runners on Linux. Default unless the user is on native Windows.
- **PowerShell (`.ps1`)** — native Windows / PowerShell-only environments.

If you can't tell from the project (no obvious OS hints, no existing scripts), ask the user.

The same pattern applies to both. Only the syntax changes.

## The Pattern

Steps **1–3** and **step 8** are identical in both variants. Steps **4–7** differ — pick the subsection below that matches the variant you decided on.

### Common steps (both variants)

1. **Toolchain check.** Verify that the required language runtime / build tool (and the required version, if any) is installed. If not, print an error and exit with code `69`.
2. **Argument validation.** Require **two** positional arguments: `<build_folder>` and `<conformance_tests_folder>`. If either is missing, print usage and exit with code `69`.
3. **Resolve the conformance tests folder to an absolute path.** Current renderers pass `$2` as an absolute path; older ones passed it relative to the invocation directory. Resolve it once, up front, into a variable the test command in step 8 uses:
   - Bash: `case "$2" in /*) CONFORMANCE_TESTS_FOLDER="$2" ;; *) CONFORMANCE_TESTS_FOLDER="$(pwd)/$2" ;; esac`
   - PowerShell: `if (-not [System.IO.Path]::IsPathRooted($ConformanceTestsFolder)) { $ConformanceTestsFolder = Join-Path (Get-Location) $ConformanceTestsFolder }`

   Never concatenate `$current_dir/$2` at the point of use — with an absolute `$2` that produces a doubled path (`/project//abs/path/...`), the classic symptom being `ImportError: Start directory is not importable` pointing at a path that contains the project root twice.

### Steps 4–7 — install-inline variant (no prepare script)

4. **Working directory setup.** Define a working folder at `<temp>/<lang>_<basename>` (`/tmp/<lang>_$(basename "$1")` in Bash, `Join-Path ([System.IO.Path]::GetTempPath()) "<lang>_$(Split-Path $BuildFolder -Leaf)"` in PowerShell). Wipe it (`rm -rf` / `Remove-Item -Recurse -Force`) and recreate it. Register cleanup so the folder is removed when the script exits — `trap 'rm -rf "$WORKING_FOLDER"' EXIT` in Bash, `Remove-Item -Recurse -Force` in the `finally` block in PowerShell. This folder — and **only** this folder — is where every subsequent write must land.
5. **Copy the build.** Recursively copy everything from `<build_folder>` (`$1`) into the working folder. **Do not** copy the conformance tests — they stay where they are. After this step both `$1` (build folder) and `$2` (conformance tests folder) are treated as **read-only** for the rest of the script.
6. **Enter the working directory.** `cd` / `Set-Location` into `<temp>/<lang>_<basename>`. If that fails, exit with code `69`. All remaining steps run from inside the working folder; they must never write back to `$1` or `$2`.
7. **Install dependencies into an isolated environment inside `<temp>/<lang>_<basename>`.** Set up a per-working-folder dependency location (a Python venv at `./.venv`, a local `./node_modules`, a project-scoped Maven repo at `./.m2`, etc.) and install/resolve all dependencies into it. **Never** install into the source build folder (`$1`), the conformance tests folder (`$2`), the user's global cache (`~/.m2`, system-wide `pip`, `~/.cargo`, `~/.npm`, ...), or anywhere outside `<temp>/<lang>_<basename>`. If the install command fails, propagate its exit code immediately and **do not** proceed to step 8. See [Dependency isolation (install-inline)](#dependency-isolation-install-inline).

### Steps 4–7 — activate-only variant (prepare script exists)

4. **Verify the prepared environment.** Both:
   - Check that the working folder `<temp>/<lang>_<basename>` exists — derived **exactly** the way prepare derives it (system temp dir + `<lang>_` + basename of `$1`).
   - Check that the language's isolation location inside it exists (e.g. `.venv/bin/activate` for Python, `.m2/` for Java, `node_modules/` for Node, `.gocache/` for Go, `.cargo/` for Rust).

   If either check fails, print a helpful error (`"Error: prepared environment missing — did you run prepare_environment_<lang>.<sh|ps1> first?"`) and exit `69`. **Do not silently fall back to creating it inline** — that would mask a real misconfiguration and turn this script into the install-inline variant in disguise. After this step both `$1` and `$2` are treated as **read-only** for the rest of the script.

   **No cleanup registration in this variant.** The working folder belongs to prepare; this script must never delete it — not via a `trap`, not in a `finally` block, not on failure. See [the cleanup contract](#variant-decision-install-inline-vs-activate-only).
5. **Enter the working directory.** `cd` / `Set-Location` into `<temp>/<lang>_<basename>`. If that fails, exit `69`. All remaining steps run from inside the working folder; they must never write back to `$1` or `$2`.
6. **Activate the prepared dependency environment.** Per-language:
   - Python: `source .venv/bin/activate` (must succeed; exit `69` on failure).
   - Java: set `MAVEN_LOCAL_REPO="$(pwd)/.m2"` so it can be passed as `-Dmaven.repo.local="$MAVEN_LOCAL_REPO"` to `mvn` in step 8.
   - Node.js / Go / Rust: nothing to activate explicitly — the test command in step 8 just needs to receive the same isolation flag/env var that prepare used (`./node_modules` is found by default; pass `GOMODCACHE` / `CARGO_HOME`).

   Activation is **always relative to the working folder**, never to `$1` or `$2` — prepare populated `<temp>/<lang>_<basename>/...`, and that is the only place to attach to.
7. *(There is no step 7 in this variant — install was prepare's job. Skip straight to step 8.)*

### Common step 8 (both variants)

8. **Run the conformance tests.** Invoke the language's standard test command, **pointed at `$CONFORMANCE_TESTS_FOLDER`** (the absolute path resolved in step 3). The script's final exit code is whatever the test command returns — except for the "no tests discovered" case below.

   The test command is **read-only** with respect to `$CONFORMANCE_TESTS_FOLDER`. It loads test files from there, but any artifacts the runner produces (caches, JUnit XML, coverage reports, compiled test classes, etc.) must land inside `<temp>/<lang>_<basename>`, not next to the test files. If your chosen runner defaults to writing output beside the tests, pass an explicit output-directory flag pointing inside the working folder (e.g. `pytest --basetemp=./.pytest_tmp`, `jest --cacheDirectory=./.jest_cache`, Maven `target/` under the working folder via `mvn -f "$CONFORMANCE_TESTS_FOLDER/pom.xml" -Dproject.build.directory="$(pwd)/target" test`).

### Read-only inputs — hard rule

A conformance script has **two** read-only inputs: the source build folder (`$1`) and the conformance tests folder (`$2`). Neither one may be written to under any circumstances. The script must never:

- install dependencies into `$1` or `$2` (no `pip install` inside `$1`/`$2`, no `npm install` inside them, no `mvn install` writing into them, no Cargo build artifacts ending up under them),
- write a virtualenv / `node_modules` / `.m2` / `.gocache` / `.cargo` directory inside `$1` or `$2`,
- run the test command with its `cwd` set to `$1` or `$2` (every test command runs from inside `<temp>/<lang>_<basename>` after the `cd` in step 6 / activate-only step 5),
- create logs, caches, build outputs, JUnit XML, coverage reports, compiled test classes, or temp files inside `$1` or `$2`.

Why each input is read-only:

- **`$1` (build folder)** is shared with the renderer (`plain_modules/<module>/code` by default) and downstream tooling. Writing into it corrupts the renderer's view of "what was generated" and breaks subsequent renders. The whole point of staging into the system temp directory is so the source folder stays a clean, reproducible artifact of the render.
- **`$2` (conformance tests folder)** is the user's authored test source — typically checked into version control. Writing into it pollutes the working tree, churns git status, and (with frameworks that auto-discover) can make subsequent runs pick up generated files as if they were tests.

If you find yourself about to issue any command whose `cwd` is `$1` or `$2`, or whose target path starts with `$1/` or `$2/`, **stop**. Either move the operation into `<temp>/<lang>_<basename>`, or you're doing something the script must not do.

### "No tests discovered" detection

The Python reference script grep's the test runner output for `"Ran 0 tests in"` and exits `1` if no tests ran. Replicate the equivalent check for the target language wherever that language's test runner silently passes when given an empty test set:

- Python `unittest`: `"Ran 0 tests in"`
- Node.js `jest`: `"No tests found"`
- Go `go test`: `"no test files"` / `"no tests to run"`
- Rust `cargo test`: `"running 0 tests"`
- Java `mvn test`: usually fails loudly already; no extra check needed.

A silently-passing zero-test run is the most dangerous failure mode of a conformance runner — always guard against it. **This applies to both variants.**

## Conventions

Shared across both shell flavors **and** both variants:

- **Exit codes:**
  - `69` — unrecoverable invocation error: missing argument, missing toolchain, can't enter working folder, can't create venv (install-inline), or prepared environment missing/broken (activate-only). Matches the reference scripts' `UNRECOVERABLE_ERROR_EXIT_CODE`.
  - `1` — "no tests discovered" guard tripped (see above).
  - Any other non-zero code — propagated from the underlying test command.
- **Working folder naming:** `<temp>/<lang>_<basename>` — the system temp directory (`/tmp` in Bash, `[System.IO.Path]::GetTempPath()` in PowerShell) plus a short identifier for the language (`java`, `python`, `node`, `go`, `rust`, ...) and the **basename** of the *first* argument (the build folder — `$(basename "$1")` / `Split-Path $BuildFolder -Leaf`), never the conformance tests folder and never the raw argument (it may be absolute; concatenating it produces broken doubled paths). All dependency installs, build outputs, caches, test runner artifacts, and the test invocation itself live inside this folder. Nothing the script does should touch `$1` after step 5 (install-inline) / step 4 (activate-only), or `$2` at any point.
- **Cleanup ownership:** the **install-inline** variant removes its working folder on exit, success and failure alike (`trap 'rm -rf "$WORKING_FOLDER"' EXIT` in Bash; `Remove-Item -Recurse -Force` in the PowerShell `finally` block, after `Pop-Location`). The **activate-only** variant **never deletes the working folder** — prepare owns its lifecycle and re-creates it once per render; deleting it here would break every subsequent per-spec invocation.
- **Logging — be as verbose as possible.** The script is the only thing the operator sees between a render and a green/red conformance result; when it fails, the only forensic evidence anyone has is its stdout/stderr. Treat the script like a production runbook, not a quiet helper. Concretely:
  - **Announce every step before doing it**, with the exact value of every variable involved — the resolved build folder, the resolved conformance-tests folder, the working folder, the language, the toolchain version detected, the isolation root being activated (install-inline) or verified (activate-only), the variant in use, and the test command about to run. "Running tests" alone is useless; "Running `python -m unittest discover -b -s /abs/path/to/tests` from working folder `/tmp/python_build/` with venv activated at `./.venv` (Python 3.11.6)" is triage-ready.
  - **Echo every non-trivial command before executing it.** In Bash, use `set -x` for the body of the script (or `echo "+ <cmd>"` immediately before each call); in PowerShell, set `$VerbosePreference = 'Continue'` and use `Write-Verbose` / `Write-Host` to print each command line with its arguments.
  - **Print clear section banners.** Each pattern step gets a banner like `===== [6/8] Activate prepared environment =====` (activate-only) or `===== [7/8] Install dependencies =====` (install-inline) so a long log can be navigated by eye, **and** the banner names the variant so the operator immediately knows which branch is executing.
  - **Print resolved absolute paths**, not just the relative names. Operators reading the log on a different machine need to know where the venv / `.m2` / `node_modules` / `.gocache` / `.cargo` actually landed, and what `$2` resolved to.
  - **Print the toolchain's own `--version` output** (and the path it resolved from) during step 1, even on success. This is the single most useful piece of forensic data when conformance passes locally but fails in CI.
  - **Surface the install / activation output verbatim** — do not pipe it to `/dev/null`, do not redirect to a log file inside the working folder. The operator must see every dependency-resolver line (install-inline) or every "venv missing" / "\.m2 missing" guard message (activate-only) in the script's own output stream. Drop the `VERBOSE`-gated wrapping from the Python reference — conformance output is where forensic data is most valuable.
  - **Print which variant the script is** (install-inline vs. activate-only) and **why** — e.g. "activate-only variant: detected `/tmp/python_build/.venv/bin/activate` from a prior `prepare_environment_python.sh` run". When the verify step trips, the operator must see both the path that was checked and the expected source ("did you run `prepare_environment_python.sh <build>` first?").
  - **On failure, print what was about to run before exiting** — the exact test command, the working directory, the resolved `$CONFORMANCE_TESTS_FOLDER`, and the relevant environment variables (`PYTHONPATH`, `NODE_PATH`, `GOMODCACHE`, `CARGO_HOME`, `MAVEN_OPTS`, `PATH`, plus `VIRTUAL_ENV` for Python).
  - **Print a final summary line** that names the variant, the test command, the exit code, the resolved conformance-tests folder, and the working folder so the operator knows exactly what to re-run by hand if needed.
  Verbosity is not noise here — a chatty script that documents itself in its own output is the difference between a 30-second triage and a 30-minute one. Never trade verbosity for terseness.
- **Resolve `$2` before any `cd`.** This is the single most common bug in hand-written conformance scripts: using the conformance-tests argument after changing directory. Resolve it to an absolute path in step 3 (absolute → use as-is; relative → prefix the invocation directory) and use only the resolved variable afterwards. The resolved value must also appear in the verbose log (per the logging rule above) so misresolutions of `$2` are visible at a glance.

### Dependency isolation (install-inline)

This section applies to **install-inline scripts only.** For activate-only scripts, the isolation location is set up by prepare; you just need to point the test command at it — see [Activating a prepared environment](#activating-a-prepared-environment-activate-only).

The dependency environment must live **inside** `$WORKING_FOLDER` so the test run can't be polluted by — or pollute — the user's global caches. Pick the most idiomatic isolation mechanism for the language:

| Language | Isolation mechanism | Install command (run inside `$WORKING_FOLDER`) | Test command (point at `$CONFORMANCE_TESTS_FOLDER`) |
|---|---|---|---|
| Python | `venv` at `./.venv` | `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` | `python -m unittest discover -b -s "$CONFORMANCE_TESTS_FOLDER"` (or `pytest "$CONFORMANCE_TESTS_FOLDER"`) |
| Node.js | local `./node_modules` (default) | `npm ci` (preferred) or `npm install` | `npx jest --rootDir "$CONFORMANCE_TESTS_FOLDER"` |
| Java | project-scoped Maven repo at `./.m2` | `mvn -Dmaven.repo.local=./.m2 install -DskipTests` (build + install artifact so the test pom can resolve it) | `mvn -f "$CONFORMANCE_TESTS_FOLDER/pom.xml" -Dmaven.repo.local="$(pwd)/.m2" test` |
| Go | module cache at `./.gocache` | `GOMODCACHE="$PWD/.gocache" go mod download` (optional pre-warm) | `GOMODCACHE="$PWD/.gocache" go test "$CONFORMANCE_TESTS_FOLDER/..."` |
| Rust | cargo home at `./.cargo` | `CARGO_HOME="$PWD/.cargo" cargo fetch` (optional pre-warm) | `CARGO_HOME="$PWD/.cargo" cargo test --manifest-path "$CONFORMANCE_TESTS_FOLDER/Cargo.toml"` |

Notes:

- **Every path in the install command and test command is relative to `<temp>/<lang>_<basename>`.** That's why the script `cd`s into the working folder in step 6 — from that point on, `./.venv`, `./node_modules`, `./.m2`, etc. all resolve under `<temp>/<lang>_<basename>`, never under `$1` or `$2`.
- **Always pass the isolation flag/env var to both the install command and the test command.** They must agree on where deps live, otherwise the test command will silently fall back to the global cache **or** (worse) write into `$1` / `$2`.
- **Python is the only ecosystem where the venv is mandatory** to satisfy "into a virtual environment" literally. The others use language-native equivalents that achieve the same isolation.
- **Propagate the install exit code immediately.** In Bash: `<install cmd> || exit $?`. In PowerShell: check `$LASTEXITCODE` and `exit $LASTEXITCODE` if non-zero.
- **Time the dependency setup** with `date +%s.%N` (Bash) / `Get-Date` (PowerShell) and print `"Requirements setup completed in X.XX seconds"`. If this number is large, that's the signal to add a `prepare_environment_<lang>` script (and switch this script to the activate-only variant).

### Activating a prepared environment (activate-only)

This section applies to **activate-only scripts only.** The isolation location was created by prepare; conformance just needs to attach to it and pass the right flags to the test command.

In the table below, `$WORKING_FOLDER` is `<temp>/<lang>_<basename>` — e.g. `/tmp/python_$(basename "$1")` in Bash.

| Language | Verify exists in step 4 | Activate in step 6 | Test command in step 8 (point at `$CONFORMANCE_TESTS_FOLDER`) |
|---|---|---|---|
| Python | `$WORKING_FOLDER/.venv/bin/activate` | `source .venv/bin/activate` (after `cd`-ing into the working folder) | `python -m unittest discover -b -s "$CONFORMANCE_TESTS_FOLDER"` |
| Node.js | `$WORKING_FOLDER/node_modules/` | (nothing) | `npx jest --rootDir "$CONFORMANCE_TESTS_FOLDER"` |
| Java | `$WORKING_FOLDER/.m2/` | `MAVEN_LOCAL_REPO="$(pwd)/.m2"` | `mvn -f "$CONFORMANCE_TESTS_FOLDER/pom.xml" -Dmaven.repo.local="$MAVEN_LOCAL_REPO" test` |
| Go | `$WORKING_FOLDER/.gocache/` | `export GOMODCACHE="$(pwd)/.gocache"` | `go test "$CONFORMANCE_TESTS_FOLDER/..."` |
| Rust | `$WORKING_FOLDER/.cargo/` | `export CARGO_HOME="$(pwd)/.cargo"` | `cargo test --manifest-path "$CONFORMANCE_TESTS_FOLDER/Cargo.toml"` |

Notes:

- **Verify, don't recreate.** If `.venv` is missing, exit `69` with a clear "did you run prepare_environment first?" message — do **not** silently fall back to creating it inline. That would silently degrade a misconfigured project into the install-inline path and mask the real problem.
- **Match prepare's isolation paths exactly.** If prepare puts the venv at `.venv` and you look for it at `venv`, the verify step will always fail. Read [`implement-prepare-environment-script`](../implement-prepare-environment-script/SKILL.md) for the canonical paths.
- **Don't time anything in this variant.** The slow phase is prepare; conformance just runs the tests. Adding a duration log here is misleading — it makes the script look like it's doing the install when it isn't.

### Bash specifics

- **Shebang:** `#!/bin/bash`.
- **File naming:** `run_conformance_tests_<lang>.sh`, placed in `assets/` (skill reference) or `test_scripts/` (target project).
- **Arguments:** `$1` = build folder, `$2` = conformance tests folder.
- **Make it executable:** `chmod +x` the produced script.
- **`cd` failure check:** the reference scripts use the `cd ... 2>/dev/null` + `[ $? -ne 0 ]` pattern. Keep it.

### PowerShell specifics

- **No shebang.** Use a `param([Parameter(Mandatory=$true)][string]$BuildFolder, [Parameter(Mandatory=$true)][string]$ConformanceTestsFolder)` block at the top instead.
- **File naming:** `run_conformance_tests_<lang>.ps1`.
- **Exit codes:** use `exit 69` etc. (PowerShell honors them just like Bash).
- **Toolchain check:** prefer `Get-Command <tool> -ErrorAction SilentlyContinue` and, where a specific version is needed, parse the tool's `--version` output.
- **Filesystem:** use `Test-Path`, `Remove-Item -Recurse -Force`, `New-Item -ItemType Directory`, `Copy-Item -Recurse`, `Set-Location`. Quote paths to handle spaces.
- **Resolve `$ConformanceTestsFolder` to absolute** with `[System.IO.Path]::IsPathRooted` + `Join-Path (Get-Location) ...` **before** any `Set-Location` call.
- **No `chmod` step needed.** If execution policy is likely to block the script, mention `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` to the user — don't bake it into the script.

## Workflow

1. **Decide the variant.** Look in the project for `prepare_environment_<lang>.sh` / `.ps1` (check `test_scripts/`, then any `prepare-environment-script:` key in `config.yaml`). If present → emit **activate-only**. If absent → emit **install-inline**. See [Variant decision](#variant-decision-install-inline-vs-activate-only).
2. Confirm the target **language**, **shell flavor** (Bash or PowerShell), and **dependency manifest** (`pom.xml`, `requirements.txt` / `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, ...). Ask if any is unclear.
3. Read [assets/run_conformance_tests_java.sh](assets/run_conformance_tests_java.sh) and [assets/run_conformance_tests_python.sh](assets/run_conformance_tests_python.sh) to refresh the exact structure. Both are install-inline references — for activate-only, follow steps 4–7 of [the activate-only variant](#steps-47--activate-only-variant-prepare-script-exists) and the [Activating a prepared environment](#activating-a-prepared-environment-activate-only) table.
4. Translate each step into the equivalent commands for the target language **and** shell. The toolchain check, dependency install/activate, and test invocation are the language-specific parts; the rest is mechanical translation between Bash and PowerShell syntax.
5. Pick the right per-language row:
   - **Install-inline:** [Dependency isolation (install-inline)](#dependency-isolation-install-inline) table — use the same flag/env var in steps 7 and 8.
   - **Activate-only:** [Activating a prepared environment](#activating-a-prepared-environment-activate-only) table — use the matching verify, activate, and test-command columns in steps 4, 6, and 8.
6. Add the language-appropriate "no tests discovered" guard from [No tests discovered detection](#no-tests-discovered-detection).
7. Save the new script. For Bash, `chmod +x` it.
8. **Update `config.yaml` to reference the new script.** Add or update the `conformance-tests-script:` key with the path to the newly created script (e.g., `conformance-tests-script: test_scripts/run_conformance_tests_<lang>.sh`). This is mandatory — the renderer needs this reference to invoke the conformance test script after rendering each functional spec.
9. **Link the script into the base `.plain` files as a linked resource.** Once the script exists on disk, it must be referenced from the project's base `.plain` module(s) — typically the one carrying `***test reqs***` for the conformance-testing strategy — so the renderer sees the script's contents as ground truth for the conformance contract. Use the `add-resource` skill to add a standard markdown link (e.g. `[conformance test runner](test_scripts/run_conformance_tests_<lang>.sh)`) inside the relevant section of the spec, with the path resolved relative to the `.plain` file. The script is a single text file, so it satisfies the linked-resource contract directly — do not link the `test_scripts/` directory, do not paraphrase the script into the spec, and do not duplicate its commands inline. If multiple base `.plain` modules reference the conformance contract (e.g. a host module and an integration module that inherits from it), link the script from each module that needs it; the linked resource lives next to the spec that owns the test req, not at the top of the chain by default. After linking, read the spec back to confirm the link path resolves to the script you just wrote. If this is the activate-only variant, link the matching `prepare_environment_<lang>` script next to it from the same spec — the two halves of the conformance contract belong together.
10. **For activate-only scripts only**: smoke-test by running `prepare_environment_<lang>.<sh|ps1> <build> && run_conformance_tests_<lang>.<sh|ps1> <build> <tests>`. If the conformance script errors with "prepared environment missing" right after a successful prepare, the two scripts disagree on either the working-folder path or the isolation location — fix that before declaring done.

## Anti-Patterns

- **(Hard mistake) Don't install into, build into, or otherwise write to the source build folder (`$1`) or the conformance tests folder (`$2`).** Both arguments are read-only input. Every install, cache, build artifact, log, JUnit XML, coverage report, compiled test class, and temp file must land in `<temp>/<lang>_<basename>`. This includes never running `pip install`, `npm install`, `mvn install`, or `cargo build` with `$1` or `$2` as their `cwd` or target; never letting a venv / `node_modules` / `.m2` / `.gocache` / `.cargo` directory appear inside `$1` or `$2`; and never running the test command from inside either folder. The whole point of staging into the system temp directory is so the build folder remains a clean artifact of the render and the conformance tests folder remains a clean tree under the user's version control — writing to either one corrupts those guarantees.
- **(Hard mistake) Don't build any path by concatenating a raw argument.** `$1` and `$2` arrive as absolute paths from current renderers. Patterns like `WORKING_FOLDER=.tmp/$1`, `WORKING_FOLDER=<lang>_$1`, or `"$current_dir/$2"` silently produce doubled paths (`/project//abs/path/...`) — the classic symptom is `ImportError: Start directory is not importable` or "folder does not exist" pointing at a path that contains the project root twice. Always derive the working folder from `$(basename "$1")` / `Split-Path -Leaf`, and use the `$CONFORMANCE_TESTS_FOLDER` resolved in step 3.
- **(Hard mistake — activate-only) Don't delete the working folder.** No `trap 'rm -rf …' EXIT`, no `Remove-Item` in `finally`, no cleanup on failure. The working folder is prepare's deliverable and is attached to N times per render; deleting it after the first invocation makes every later invocation fail the "prepared environment missing" guard. Cleanup belongs to the install-inline variant only.
- **Don't emit the install-inline variant when a `prepare_environment_<lang>` script already exists.** The conformance script's staging `rm -rf` and exit cleanup will wipe everything prepare did, and the inline install will redo it from scratch on every run. Always run the [Variant decision](#variant-decision-install-inline-vs-activate-only) check first.
- **Don't emit the activate-only variant when no prepare script exists.** The "verify prepared environment" check will fail on every run because nothing has populated the working folder.
- **Don't silently fall back from activate-only to install-inline** when the prepared environment is missing. Exit `69` with a clear error so the misconfiguration is visible. Silent fallback hides the real bug and produces inconsistent behavior between runs.
- **Don't copy the conformance tests folder into the working folder.** Only the build folder is staged (and only in install-inline). The test folder is read in place from `$CONFORMANCE_TESTS_FOLDER`.
- **Don't compute the test path after `cd`.** Resolve `$2` to an absolute path in step 3; otherwise a relative `$2` will be resolved against the working folder and silently miss the tests.
- **Don't skip the "no tests discovered" check.** A conformance suite that finds zero tests and exits `0` is the worst possible failure mode — it looks like success in CI.
- **Don't skip the toolchain check**, even when "everyone has it installed" — exit code `69` is what the calling system relies on to detect a missing runtime.
- **Don't reuse the source folder in place** (install-inline). Always copy into `<temp>/<lang>_<basename>` first; the renderer relies on this isolation.
- **Don't change the exit-code contract.** Other parts of the system branch on `69` and `1` specifically — and these codes must be identical between the Bash and PowerShell variants.
- **Don't write a cross-shell hybrid** (e.g. a `.sh` that detects PowerShell, or vice versa). Ship one script per shell, named with the appropriate extension.
- **Don't install dependencies into the user's global location** (`~/.m2`, system-wide `pip`, `~/.cargo`, etc.) in the install-inline variant. Always isolate inside `$WORKING_FOLDER` so concurrent runs and other projects can't interfere.
- **Don't run the test command without first verifying the install / activation succeeded.** A failed install (or missing prepared env) followed by a "test" run produces misleading errors that look like test failures.
- **Don't forget to update `config.yaml`.** After creating the conformance test script, always add or update the `conformance-tests-script:` key in `config.yaml` to reference the new script. Without this entry, the renderer won't know where to find the conformance test script.
- **Don't forget to link the script as a resource in the base `.plain` files.** A script that is referenced only from `config.yaml` is invisible to the spec contract — the renderer treats `conformance-tests-script:` as a build-system pointer, not as part of the test-req contract the model reads. Use the `add-resource` skill to add a markdown link to the script from the `.plain` module that owns the conformance test reqs (see Workflow step 9). Omitting the linked resource means the model authors and reviews conformance-test code without ever seeing the actual runner it has to satisfy — and for activate-only scripts, the model also loses sight of which isolation paths must already be in place by the time tests run.
- **Don't write a terse script.** Silent steps, `>/dev/null` redirects on the install / activation output, missing `--version` prints, absent variant banners, an un-logged resolved `$2`, and a missing final summary all make the script harder to debug than the tests it is running. Follow the *Logging — be as verbose as possible* rule under [Conventions](#conventions) literally: every step announces itself, every command is echoed, the variant is named in its banner, the resolved `$CONFORMANCE_TESTS_FOLDER` is printed, every failure prints what was about to run and where, and the final summary names the variant, test command, exit code, and working folder.
