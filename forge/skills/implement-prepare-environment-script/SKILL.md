---
name: implement-prepare-environment-script
description: >-
  Implement a prepare-environment script (Bash on macOS/Linux, PowerShell on
  Windows) for an arbitrary programming language, following the same conceptual
  pattern as the bundled Java reference script in assets/. Use when the user
  wants to add a one-time per-build setup step (install deps, pre-build
  artifacts, populate caches) for a new language (Python, Node.js, Go, Rust,
  Flutter, etc.) to a ***plain project, or wants to regenerate / adapt the
  existing Java runner.
---

# Implement Prepare Environment Script

This skill produces a single executable script that performs the **one-time per-build setup** that precedes a conformance-test run, following a consistent, language-agnostic pattern.

The reference implementation is [assets/prepare_environment_java.sh](assets/prepare_environment_java.sh) and [assets/prepare_environment_python.sh](assets/prepare_environment_python.sh). Read it first — every script you produce must be a faithful translation of that pattern into the target language's tooling **and** the user's shell environment.

## What a prepare-environment script is for

`prepare_environment_<lang>` is an **optional** sibling of [`run_conformance_tests_<lang>`](../implement-conformance-testing-script/SKILL.md). It runs **immediately before** the conformance script and exists to:

1. **Stage the build** into a working folder (the same one the conformance script will use).
2. **Pre-warm the dependency cache / build artifacts** so the conformance script can start cold without re-downloading or re-compiling anything.

When this script exists for a project, the corresponding conformance script's own dependency-install phase degrades to "activate only" (see [`implement-conformance-testing-script/SKILL.md`](../implement-conformance-testing-script/SKILL.md) → "Skipping setup when `prepare_environment` exists"). When it doesn't exist, the conformance script does the setup inline.

### Why this script exists at all (the structural reason)

The conformance test runner is invoked **once per functional spec** by the renderer — not once per render. Each functional spec in a module has its own `plain_modules/<module>/tests/<spec>/` folder, and after the renderer finishes generating code for a new spec, it runs the conformance tests of **every previous spec** in the same module to detect regressions. For a module with N functional specs, the conformance script is invoked roughly N times on every render.

Without a prepare script, every one of those N invocations does the full dependency install (Python venv + `pip install`, full Maven dependency tree, `npm ci`, `cargo build`, ...) from scratch. That cost — paid N times per render — dominates the wall-clock time of rendering a non-trivial project.

`prepare_environment_<lang>` exists to **amortize that cost to one** install per render:

- Prepare runs **once**, installs everything, populates the project-local isolation location inside the working folder `<temp>/<lang>_<basename>/` (`./.venv`, `./node_modules`, `./.m2`, `./.gocache`, `./.cargo`, `./.pub-cache`). Throughout this skill, `<temp>/<lang>_<basename>` means: the system temp directory (`/tmp` in Bash, `[System.IO.Path]::GetTempPath()` in PowerShell), a short language identifier, and the **basename** of the build-folder argument (`$(basename "$1")` / `Split-Path -Leaf`) — never the raw argument, which arrives as an absolute path from current renderers.
- The conformance script then runs **N times**, each invocation in its [activate-only variant](../implement-conformance-testing-script/SKILL.md#variant-decision-install-inline-vs-activate-only), attaching to the already-populated working folder and skipping the install step entirely.
- Net effect: install cost goes from `N × install-cost` to `1 × install-cost + N × cheap-attach-cost`.

This is the **whole reason** the prepare-then-conformance split exists. If a project has so few functional specs that the install overhead is negligible, generating a prepare script is wasted effort — the install-inline variant of the conformance script is fine. If a project has many specs (or expensive dependencies, GPU builds, browser binaries, etc.), prepare is mandatory in practice. The user decides per project; this skill is the tool to execute that decision.

### `prepare_environment` is conformance-only — NOT for unit tests

> **Common and costly mistake:** assuming `prepare_environment_<lang>` is a generic "warm up the environment for all the testing scripts" step that the unit-test runner also depends on. It is not.

`prepare_environment_<lang>` exists **solely** to set up the working folder that `run_conformance_tests_<lang>` then attaches to (via the activate-only variant of the conformance script). It has **no relationship** to [`run_unittests_<lang>`](../implement-unit-testing-script/SKILL.md):

- The unit-test runner is **fully self-contained**. It does its own staging into its **own** `<temp>/<lang>_<basename>/` working folder, and it installs its own dependencies inline (`pip install -r requirements.txt`, `npm ci`, `mvn`, `cargo fetch`, ...) every run — and it removes that folder when it exits.
- The unit-test runner **never reads from** the working folder `prepare_environment` populates. The two scripts use independent working folders even when they happen to share a `<temp>/<lang>_<basename>/` naming convention — each script wipes and rebuilds its own copy.
- The unit-test runner **does not require** `prepare_environment` to have run first. Users and CI systems routinely run unit tests as a smoke check without ever invoking conformance, and that must keep working.
- There is **no activate-only variant** of the unit-test runner. [`implement-unit-testing-script`](../implement-unit-testing-script/SKILL.md) emits a self-contained script every time — the two-variant pattern is exclusive to the conformance runner.

When authoring `prepare_environment_<lang>`, scope it strictly to what the **conformance** script needs. Do not bake in dependency installs the unit-test runner needs but conformance doesn't; do not stage files the unit-test runner reads; do not assume the unit-test runner will be the one consuming what you produce. If you find yourself reaching for those, **stop** — the right answer is to leave `prepare_environment` alone and let the unit-test runner handle its own dependencies inline.

## How prepare-environment scripts differ from the others
 
This script shares most of its structure with its two siblings ([`run_unittests_<lang>`](../implement-unit-testing-script/SKILL.md) and [`run_conformance_tests_<lang>`](../implement-conformance-testing-script/SKILL.md)) but with these differences:

1. **One positional argument: `<build_folder>`.** No conformance tests folder — that's the conformance script's input, not this one's.
2. **No test execution step.** This script only stages and installs/builds. It never runs unit tests or conformance tests.
3. **No "no tests discovered" guard.** Same reason — no tests are run here.
4. **Side effects must be visible to the conformance script.** Anything this script does (working-folder name, dependency isolation location, installed artifacts) must match exactly what the conformance script expects to find. See [Coordination contract](#coordination-contract).

Everything else — toolchain check, build staging, dependency isolation, exit codes — is the same.

## Pick the Shell First

Before writing anything, decide which shell flavor the script must target — it depends on the **host machine running this skill**, not on the language. **Detect the host OS proactively; do not default to Bash.**

| Host OS | Emit | How to detect |
|---|---|---|
| macOS | `.sh` | `uname -s` returns `Darwin` |
| Linux (incl. WSL, CI runners) | `.sh` | `uname -s` returns `Linux` |
| Native Windows (PowerShell, cmd) | `.ps1` | `$OS` env var contains `Windows_NT`, or `uname -s` returns `MINGW*` / `MSYS*` / `CYGWIN*` (Git Bash / MSYS2 / Cygwin shells on Windows) |

Run `uname -s 2>/dev/null || echo "$OS"` if unsure — don't ask the user before checking.

If the project will be used on **both** macOS/Linux and Windows by different team members or CI runners, generate **both** `.sh` and `.ps1` versions of this script — they're mechanical translations of each other, share exit codes and isolation paths, and the orchestrator (or the user's CI) picks the right one at runtime. The corresponding `run_conformance_tests_<lang>` script must be produced in matching pairs too.

If you genuinely can't tell (e.g. running in a sandbox with no shell access), ask the user — but only after the detection above failed.

The same pattern applies to both shell flavors. Only the syntax changes.

## The Pattern

Every prepare-environment script must implement these steps **in this order**:

1. **Toolchain check.** Verify that the required language runtime / build tool (and the required version, if any) is installed. If not, print an error and exit with code `69`.
2. **Argument validation.** Require **one** positional argument: `<build_folder>`. If missing, print usage and exit with code `69`. The renderer passes this argument as an **absolute path** (older renderer versions passed a relative one) — the script must work with both, which is why the working-folder name in step 3 is built from the argument's *basename*, never from the raw argument.
3. **Working directory setup.** Define a working folder at `<temp>/<lang>_<basename>` — **identical** to the path the conformance script will use (`/tmp/<lang>_$(basename "$1")` in Bash, `Join-Path ([System.IO.Path]::GetTempPath()) "<lang>_$(Split-Path $BuildFolder -Leaf)"` in PowerShell). Wipe it (`rm -rf` / `Remove-Item -Recurse -Force`) and recreate it. This folder — and **only** this folder — is where every subsequent write must land. **Do not register a cleanup trap / `finally` deletion** — unlike its two siblings, prepare deliberately leaves the working folder populated on exit; that folder *is* the deliverable the conformance script attaches to.
4. **Copy the build.** Recursively copy everything from `<build_folder>` (`$1`) into the working folder. After this step the source folder (`$1`) is treated as **read-only** for the rest of the script.
5. **Enter the working directory.** `cd` / `Set-Location` into `<temp>/<lang>_<basename>`. If that fails, exit with code `69`. All remaining steps run from inside the working folder; they must never write back to `$1`.
6. **Install dependencies / pre-build artifacts into an isolated environment inside `<temp>/<lang>_<basename>`.** Set up a per-working-folder dependency location (a Python venv at `./.venv`, a local `./node_modules`, a project-scoped Maven repo at `./.m2`, etc.) and install/resolve all dependencies into it. Where the language requires building before tests can run (Java, Rust, Go), also produce the build artifact and place it where the conformance script can find it — **inside the working folder**, never inside `$1` and never in the user's home directory. **Never** install into the source build folder (`$1`), the user's global cache (`~/.m2`, system-wide `pip`, `~/.cargo`, `~/.npm`, ...), or anywhere outside `<temp>/<lang>_<basename>`. If any sub-step fails, exit with code `69` (do **not** propagate Maven/pip/npm exit codes — a half-prepared environment is itself an unrecoverable error). See [Dependency isolation](#dependency-isolation) for per-language specifics.

That's it. There is no step 7. Once dependencies are installed and (where applicable) the build artifact is in the local repo, this script's job is done — and the populated working folder is intentionally left in place for the conformance runner.

### The build folder is read-only — hard rule

The source build folder passed in as `$1` is **input only**. Prepare reads from it once in step 4 to populate the working folder, and after that the script must never:

- install dependencies into it (no `pip install` inside `$1`, no `npm install` inside `$1`, no `mvn install` writing into `$1`, no Cargo build artifacts ending up under `$1`),
- write a virtualenv / `node_modules` / `.m2` / `.gocache` / `.cargo` / `.pub-cache` directory inside it,
- pre-build into it (every compile output — `target/`, `build/`, `dist/`, native binaries, generated sources — lives inside `<temp>/<lang>_<basename>`),
- create logs, caches, or temp files inside it.

The build folder is shared with the renderer (`plain_modules/<module>/code` by default) and with the conformance script, which staging-checks the working folder via `if [ ! -d "/tmp/<lang>_$(basename "$1")" ]` and expects `$1` itself to look the same as it did right after rendering. Writing into `$1` corrupts the renderer's view of "what was generated", churns git status if the project commits `$1`, and (if the conformance script ever does an `rm -rf $1` during its own setup) silently destroys work prepare did.

The whole point of staging into `<temp>/<lang>_<basename>` is so the source build folder stays a clean, reproducible artifact of the render and no build debris lands inside the user's project. Every dependency, every compiled class, every binary, every cache must land inside the working folder — because that is exactly what the conformance script's activate-only variant attaches to.

If you find yourself about to issue any command whose `cwd` is `$1`, or whose target path starts with `$1/`, **stop**. Either move the operation into `<temp>/<lang>_<basename>`, or you're doing something the script must not do.

## Coordination contract

This is the most important part of the skill. A prepare-environment script that doesn't agree with its conformance sibling on **where** it puts things is worse than no prepare script at all — it costs time and creates the *appearance* of a warm environment without actually warming the right one.

The two scripts must agree on:

| What | Why it matters |
|---|---|
| **Working folder path** (`<temp>/<lang>_<basename>`) | The conformance script `cd`s into this folder. If prepare uses a different name, the conformance script sees an empty / freshly-staged folder and re-does all the work. Both scripts must derive it the same way: system temp dir + `<lang>_` + basename of `$1`. |
| **Working folder lifecycle** | Prepare wipes-and-recreates the folder at the start and **leaves it populated on exit**. The activate-only conformance script attaches to it and **never deletes it** — not on success, not on failure. Only prepare (on its next run) recreates it. A cleanup trap in either script destroys the amortization this pair exists for. |
| **Dependency isolation location** (`./.venv`, `./.m2`, `./node_modules`, `./.gocache`, `./.cargo`, …) — relative to the working folder | If prepare populates `~/.m2` and conformance reads from `./.m2`, the warm cache is invisible. Always use the **project-local** path inside the working folder, in both scripts. |
| **Build artifact location** (Java/Rust/Go) | The conformance test project depends on the build's artifact. It must be findable at the exact coordinates the conformance script expects (e.g. installed into the same project-local `./.m2` for Java). |
| **Toolchain version** | If prepare runs under Java 21 and conformance runs under Java 17, classfile incompatibilities will surface at test time, not prepare time. Both scripts should perform the same toolchain check. |

When in doubt, **read the conformance script first** and mirror its assumptions exactly.

## Conventions

Shared across both shell flavors:

- **Exit codes:**
  - `69` — unrecoverable: missing argument, missing toolchain, can't enter working folder, dependency install / build failed. Treat **all** failures as unrecoverable here — there is no "soft" failure mode for prepare.
  - `0` — success.
- **Working folder naming:** `<temp>/<lang>_<basename>` — the system temp directory (`/tmp` in Bash, `[System.IO.Path]::GetTempPath()` in PowerShell) plus a short identifier for the language (`java`, `python`, `node`, `go`, `rust`, ...) and the **basename** of the first (and only) argument (`$(basename "$1")` / `Split-Path -Leaf`). Never embed the raw argument in the path — it may be absolute, and concatenating it produces broken doubled paths. All dependency installs, build outputs, caches, and pre-built artifacts live inside this folder. Nothing the script does should touch `$1` after step 4.
- **No cleanup on exit.** Prepare leaves the working folder populated — that folder is its deliverable. Do not add a `trap … EXIT` / `finally` deletion; the folder is reclaimed the next time prepare wipes-and-recreates it (and the OS eventually reclaims the temp dir).
- **Logging — be as verbose as possible.** The script is the only thing the operator sees between a render and a green/red conformance result; when prepare fails, the only forensic evidence anyone has is its stdout/stderr. Treat the script like a production runbook, not a quiet helper. Concretely:
  - **Announce every step before doing it**, with the exact value of every variable involved — the resolved source folder, the working folder, the language, the toolchain version detected, the isolation root, the dependency-manifest path, the install / pre-build command about to run. "Installing dependencies" alone is useless; "Installing dependencies from `./requirements.txt` into venv `./.venv` (Python 3.11.6 at `/usr/local/bin/python3`)" is triage-ready.
  - **Echo every non-trivial command before executing it.** In Bash, use `set -x` for the body of the script (or `echo "+ <cmd>"` immediately before each call); in PowerShell, set `$VerbosePreference = 'Continue'` and use `Write-Verbose` / `Write-Host` to print each command line with its arguments.
  - **Print clear section banners.** Each pattern step gets a banner like `===== [4/6] Copy build into working folder =====` so a long log can be navigated by eye.
  - **Print resolved absolute paths**, not just the relative names. Operators reading the log on a different machine need to know where the venv / `.m2` / `.gocache` / `.cargo` / `.pub-cache` actually landed.
  - **Print the toolchain's own `--version` output** (and the path it resolved from) during step 1, even on success. This is the single most useful piece of forensic data when prepare succeeds locally but fails in CI.
  - **Surface the install / pre-build output verbatim** — do not pipe it to `/dev/null`, do not redirect to a log file inside the working folder. The operator must see every dependency-resolver line, every compile-warning, every artifact-install line in the script's own output stream. Drop the `VERBOSE`-gated wrapping from the Java reference — prepare is the slowest phase and the place where forensic data is most valuable.
  - **On failure, print what was about to run before exiting `69`** — the exact command, the working directory, the relevant environment variables (`PYTHONPATH`, `NODE_PATH`, `GOMODCACHE`, `CARGO_HOME`, `MAVEN_OPTS`, `PUB_CACHE`, `PATH`).
  - **Print a final summary line** that names the language, the working folder, the isolation root, the wall-clock duration, and exit code `0` so the operator knows exactly what was prepared and where conformance will look for it.
  Verbosity is not noise here — a chatty script that documents itself in its own output is the difference between a 30-second triage and a 30-minute one. Never trade verbosity for terseness.
- **Time the dependency setup** with `date +%s.%N` (Bash) / `Get-Date` (PowerShell) and print a duration line at the end. This is the slowest phase and the whole reason this script exists; the duration tells you whether it's actually saving time. The duration line is part of the final summary required by the verbose-logging rule above.

### Dependency isolation

The dependency environment must live **inside** `$WORKING_FOLDER` so the conformance script can find it and so concurrent runs of other languages / projects can't interfere. Pick the most idiomatic isolation mechanism for the language — and make sure it matches what the conformance script reads from:

| Language | Isolation mechanism | Prepare command (run inside `$WORKING_FOLDER`) |
|---|---|---|
| Python | `venv` at `./.venv` | `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` |
| Node.js | local `./node_modules` (default) | `npm ci` (preferred) or `npm install` |
| Java | project-scoped Maven repo at `./.m2` | `mvn -Dmaven.repo.local="$(pwd)/.m2" install -DskipTests` (builds and installs the project's own jar into the repo so dependent test projects can resolve it) |
| Go | module cache at `./.gocache` | `GOMODCACHE="$PWD/.gocache" go mod download && GOMODCACHE="$PWD/.gocache" go build ./...` |
| Rust | cargo home at `./.cargo` | `CARGO_HOME="$PWD/.cargo" cargo build --tests` (compiles deps + tests in one shot) |
| Flutter | pub cache at `./.pub-cache` | `PUB_CACHE="$PWD/.pub-cache" flutter pub get && flutter precache` |

Notes:

- **Every path in the install / pre-build command is relative to `<temp>/<lang>_<basename>`.** That's why the script `cd`s into the working folder in step 5 — from that point on, `./.venv`, `./node_modules`, `./.m2`, `./.gocache`, `./.cargo`, `./.pub-cache`, and any compile output (`target/`, `build/`, `dist/`, native binaries) all resolve under `<temp>/<lang>_<basename>`, never under `$1` and never under the user's home directory.
- **Java/Rust/Go must compile, not just download.** The conformance script will time-out / re-compile from scratch if you only resolve metadata. Use `mvn install`, `cargo build --tests`, `go build ./...` (not just `dependency:resolve` / `cargo fetch` / `go mod download`).
- **Python and Node.js only need to install** — they're interpreted/JIT-compiled at test time, so `pip install` / `npm ci` is sufficient.
- **Always pass the isolation flag/env var.** `mvn` without `-Dmaven.repo.local`, `cargo` without `CARGO_HOME`, etc., write to the user's home directory instead of `$WORKING_FOLDER`. The conformance script will look in the wrong place and the warming was wasted — and the user's home dir gets polluted.
- **Treat install failures as `exit 69`.** Unlike the conformance script (which propagates the test command's exit code), prepare has no notion of "the user's tests legitimately failed" — every failure here means the environment isn't usable, period.

### Bash specifics

- **Shebang:** `#!/bin/bash`.
- **File naming:** `prepare_environment_<lang>.sh`, placed in `assets/`.
- **Argument:** `$1`.
- **Make it executable:** `chmod +x assets/prepare_environment_<lang>.sh`.
- **`cd` failure check:** use the `cd ... 2>/dev/null` + `[ $? -ne 0 ]` pattern from the reference. Put the success log line *after* the failure check, not before — otherwise it lies on failure.

### PowerShell specifics

- **No shebang.** Use a `param([Parameter(Mandatory=$true)][string]$BuildFolder)` block at the top instead.
- **File naming:** `prepare_environment_<lang>.ps1`, placed in `assets/`.
- **Exit codes:** use `exit 69` etc. (PowerShell honors them just like Bash).
- **Toolchain check:** prefer `Get-Command <tool> -ErrorAction SilentlyContinue` and, where a specific version is needed, parse the tool's `--version` output.
- **Filesystem:** use `Test-Path`, `Remove-Item -Recurse -Force`, `New-Item -ItemType Directory`, `Copy-Item -Recurse`, `Set-Location`. Quote paths to handle spaces.
- **No `chmod` step needed.** If execution policy is likely to block the script, mention `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` to the user — don't bake it into the script.

## Workflow

1. **Detect the host OS** to pick the script flavor. Run `uname -s 2>/dev/null || echo "$OS"` and apply the rules in [Pick the Shell First](#pick-the-shell-first): `Darwin`/`Linux` → `.sh`, `Windows_NT`/`MINGW*`/`MSYS*`/`CYGWIN*` → `.ps1`. If the project targets both macOS/Linux **and** Windows (multi-OS team or CI), plan to produce **both** `.sh` and `.ps1` files — repeat steps 3–8 for each.
2. Confirm the target **language**, **dependency manifest** (`pom.xml`, `requirements.txt` / `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, ...), and — critically — **read the corresponding `run_conformance_tests_<lang>` script first** if one already exists, so you know what isolation paths and toolchain versions to mirror. Ask if any is unclear.
3. Read [assets/prepare_environment_java.sh](assets/prepare_environment_java.sh) to refresh the exact structure. Note: that reference still has divergences from the contract above (see Anti-Patterns) — follow the contract, not the bugs.
4. Translate each of the six pattern steps into the equivalent commands for the target language **and** shell. The toolchain check and dependency install/build are the language-specific parts; the rest is mechanical translation between Bash and PowerShell syntax.
5. Pick the dependency-isolation mechanism from the [Dependency isolation](#dependency-isolation) table. **Verify it matches the path used by the corresponding `run_conformance_tests_<lang>` script.**
6. Save the new script to the appropriate `test_scripts/` location (e.g. `test_scripts/prepare_environment_<lang>.sh` / `.ps1`). For Bash, `chmod +x` it.
7. **Update `config.yaml` to reference the new script.** Add or update the `prepare-environment-script:` key with the path to the newly created script (e.g., `prepare-environment-script: test_scripts/prepare_environment_<lang>.sh`). This is mandatory — the renderer needs this reference to invoke the prepare script before running conformance tests.
8. **Link the script into the base `.plain` files as a linked resource.** Once the script exists on disk, it must be referenced from the project's base `.plain` module(s) — typically the one carrying `***test reqs***` for the conformance-testing strategy — so the renderer sees the script's contents as ground truth for the prepare contract. Use the `add-resource` skill to add a standard markdown link (e.g. `[prepare environment](test_scripts/prepare_environment_<lang>.sh)`) inside the relevant section of the spec, with the path resolved relative to the `.plain` file. The script is a single text file, so it satisfies the linked-resource contract directly — do not link the `test_scripts/` directory, do not paraphrase the script into the spec, and do not duplicate its commands inline. If multiple base `.plain` modules reference the prepare contract (e.g. a host module and an integration module that inherits from it), link the script from each module that needs it; the linked resource lives next to the spec that owns the test req, not at the top of the chain by default. After linking, read the spec back to confirm the link path resolves to the script you just wrote.
9. **Reconcile the conformance script (see next section).** This is mandatory whenever a matching `run_conformance_tests_<lang>` already exists in the project.
10. After both scripts are in place and `config.yaml` is updated, do a paired re-read: open prepare and conformance side by side and confirm they agree on working folder name, isolation path, and toolchain version.

## Reconcile the existing conformance script

Adding a `prepare_environment_<lang>` script changes the contract for the corresponding `run_conformance_tests_<lang>` script — anything prepare now handles must be **removed** from conformance, otherwise prepare's work is wiped (by re-staging) or duplicated (by re-installing). Run this reconciliation **every time** this skill is used.

### Step-by-step

1. **Look for an existing conformance script** in the project. Check the conventional locations (`test_scripts/run_conformance_tests_<lang>.sh` / `.ps1`, or wherever the project's `config.yaml` points its `conformance-tests-script:` key).
2. **If it doesn't exist → stop. Nothing to reconcile.** The conformance script will be generated later by [`implement-conformance-testing-script`](../implement-conformance-testing-script/SKILL.md), which already knows about the activate-only variant.
3. **If it does exist → patch it.** Identify and remove the steps that prepare now owns:

| Step in conformance | If prepare exists, you must... |
|---|---|
| Staging block (`rm -rf` of the working folder + `mkdir -p` + `cp -R $1/*` into it) | **Remove entirely.** Replace with a guard: `WORKING_FOLDER="/tmp/<lang>_$(basename "$1")"; if [ ! -d "$WORKING_FOLDER" ]; then echo "Error: build folder missing — run prepare_environment_<lang>.sh first."; exit 69; fi` |
| Dependency install / pre-build (`pip install`, `mvn install -DskipTests`, `npm ci`, `cargo build --tests`, etc.) | **Remove entirely.** Replace with a guard that the isolation location exists (`.venv/bin/activate` for Python, `.m2/` for Java, `node_modules/` for Node, etc.) and exit `69` if missing. |
| Activation step (Python `source .venv/bin/activate`, Java `-Dmaven.repo.local=$(pwd)/.m2`) | **Keep.** Without it the test command can't see the prepared deps. |
| Working-folder cleanup on exit (`trap 'rm -rf "$WORKING_FOLDER"' EXIT` / `Remove-Item` in `finally`) | **Remove entirely.** The activate-only variant never deletes the working folder — prepare owns its lifecycle. Leaving the trap in wipes the warmed environment after the first conformance run, so every later run fails the "missing prepared environment" guard. |
| Test execution + "no tests discovered" guard + exit-code propagation | **Keep unchanged.** |

4. **Verify the conformance script's exit codes still follow [`implement-conformance-testing-script`](../implement-conformance-testing-script/SKILL.md)** — the new "missing prepared environment" guard should exit `69` (unrecoverable invocation error), the no-tests guard should still exit `1`, and the test command's exit code should still propagate.
5. **Run a smoke check**: `prepare_environment_<lang>.sh <build_folder> && run_conformance_tests_<lang>.sh <build_folder> <conformance_tests_folder>` should succeed end-to-end. If conformance fails with "missing prepared environment" right after a successful prepare, the two scripts disagree on either the working-folder path or the isolation location — go back to [Coordination contract](#coordination-contract).

### When to skip this reconciliation

- **The conformance script doesn't exist yet.** Nothing to reconcile.
- **The conformance script already shows no signs of inline staging or install.** It was previously generated as the activate-only variant — leave it alone.
- **The user explicitly asks to keep prepare and conformance independent** (e.g. so conformance can run standalone without prepare). Document this clearly in a comment at the top of both scripts and skip the reconciliation. Note that this loses all the speedup prepare was meant to provide.

## Anti-Patterns

- **(Hard mistake) Don't pre-warm the unit-test runner from this script.** `prepare_environment_<lang>` is for the **conformance** script only. The unit-test runner ([`implement-unit-testing-script`](../implement-unit-testing-script/SKILL.md)) is always fully self-contained — it stages, installs, and runs in one shot, every invocation, regardless of whether a prepare script exists. Do not add a unit-test dependency-install step to `prepare_environment` "to save time"; the unit-test runner will not read what you produce, and the coupling breaks the activate-only contract between prepare and conformance. See [`prepare_environment` is conformance-only — NOT for unit tests](#prepare_environment-is-conformance-only--not-for-unit-tests) above.
- **(Hard mistake) Don't install into, build into, or otherwise write to the source build folder (`$1`).** The build folder passed as `$1` is read-only input after step 4. Every install, cache, build artifact (`target/`, `build/`, `dist/`, native binaries, generated sources), log, and temp file must land in `<temp>/<lang>_<basename>`. This includes never running `pip install`, `npm install`, `mvn install`, `cargo build`, or `go build` with `$1` as their `cwd` or target; never letting a venv / `node_modules` / `.m2` / `.gocache` / `.cargo` / `.pub-cache` directory appear inside `$1`; and never producing a pre-built artifact at any path under `$1/`. The whole point of staging into the system temp directory is so the build folder remains a clean artifact of the render — writing to it corrupts the renderer's view, churns git status, and can be silently destroyed if the conformance script ever re-stages `$1` on its own.
- **(Hard mistake) Don't build any path by concatenating the raw build-folder argument.** `$1` arrives as an absolute path from current renderers. Patterns like `WORKING_FOLDER=.tmp/$1` or `WORKING_FOLDER=<lang>_$1` silently produce doubled paths (`/project//abs/path/...`) — the classic symptom is a "folder does not exist" or `ImportError: Start directory is not importable` error pointing at a path that contains the project root twice. Always take `$(basename "$1")` / `Split-Path -Leaf`.
- **(Hard mistake) Don't add a cleanup trap that deletes the working folder on exit.** The populated working folder is this script's deliverable — the activate-only conformance runner attaches to it N times per render. Deleting it on exit turns every conformance run into a "missing prepared environment" failure. (The unit-test and install-inline conformance scripts *do* clean up after themselves; prepare and activate-only conformance never do.)
- **Don't write to the user's global dependency cache** (`~/.m2`, system-wide `pip`, `~/.cargo`, `~/.npm`, etc.). The conformance script reads from the project-local cache; a global write is invisible to it and pollutes the user's home dir.
- **Don't use a different working folder name than the conformance script.** They must match exactly. If you change one, change the other.
- **Don't run tests** — not unit tests, not conformance tests, not smoke tests. Prepare's contract is "set up the environment"; running tests belongs to its siblings.
- **Don't propagate non-`69` exit codes from `mvn` / `pip` / `npm`.** A failed install means the environment isn't usable. Treat every failure as `exit 69` so the orchestrator can tell "prepare failed" apart from "tests failed".
- **Don't skip the toolchain check**, even when "everyone has it installed" — exit code `69` is what the calling system relies on to detect a missing runtime, and prepare is usually the *first* script to run, so it's the cheapest place to surface a missing JDK / Python / Node.
- **Don't print the "moved to ..." line before the `cd` success check.** The reference script does this and it lies on failure. Put the log *after* the guard, or print "attempting to enter ..." instead.
- **Don't reuse the source folder in place.** Always copy into `<temp>/<lang>_<basename>` first; the conformance script relies on this isolation.
- **Don't change the exit-code contract between Bash and PowerShell variants.** The `.sh` and `.ps1` for the same language must use identical exit codes for identical failure modes.
- **Don't write a cross-shell hybrid** (e.g. a `.sh` that detects PowerShell, or vice versa). Ship one script per shell, named with the appropriate extension.
- **Don't forget to time the install.** Without the duration log, there's no way to tell whether prepare is actually saving wall-clock time vs. doing the same work the conformance script would have done inline.
- **Don't leave an existing `run_conformance_tests_<lang>` script untouched after generating prepare.** If the conformance script still does its own staging and install, prepare's work is wiped (by the `rm -rf`) or duplicated (by re-running install) on every run — defeating the purpose of this skill entirely. Always run the [Reconcile the existing conformance script](#reconcile-the-existing-conformance-script) step.
- **Don't default to Bash without checking the host OS.** A `.sh` script on native Windows (outside Git Bash / WSL) won't even run, and a `.ps1` script on macOS/Linux is equally useless. Always run the detection in [Pick the Shell First](#pick-the-shell-first) before deciding the file extension. If the project supports both, produce both files — and remember to reconcile the matching conformance script in **both** flavors too.
- **Don't forget to update `config.yaml`.** After creating the prepare environment script, always add or update the `prepare-environment-script:` key in `config.yaml` to reference the new script. Without this entry, the renderer won't know to invoke the prepare script before running conformance tests, and the entire optimization will be bypassed.
- **Don't forget to link the script as a resource in the base `.plain` files.** A script that is referenced only from `config.yaml` is invisible to the spec contract — the renderer treats `prepare-environment-script:` as a build-system pointer, not as part of the test-req contract the model reads. Use the `add-resource` skill to add a markdown link to the script from the `.plain` module that owns the conformance / prepare test reqs (see Workflow step 8). Omitting the linked resource means the model authors and reviews conformance-test code without ever seeing the actual environment-prep contract it has to satisfy — and it cannot reason about which isolation paths conformance must activate.
- **Don't write a terse script.** Silent steps, `>/dev/null` redirects on the install / pre-build output, missing `--version` prints, absent failure banners, and a missing final summary line all make the script harder to debug than the code it is preparing. Follow the *Logging — be as verbose as possible* rule under [Conventions](#conventions) literally: every step announces itself, every command is echoed, every failure prints what was about to run and where, and the final summary names the language, working folder, isolation root, and duration.
