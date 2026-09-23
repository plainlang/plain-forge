---
name: implement-unit-testing-script
description: >-
  Implement a unit-test runner script (Bash on macOS/Linux, PowerShell on
  Windows) for an arbitrary programming language, following the same conceptual
  pattern as the bundled Java reference script in assets/. Use when the user
  wants to add a testing script for a new language (Python, Node.js, Go, Rust,
  etc.) to a ***plain project, or wants to regenerate / adapt the existing
  Java runner.
---

# Implement Unit Testing Script

This skill produces a single executable script that runs the unit tests for a generated build folder, following a consistent, language-agnostic pattern.

The reference implementation is [assets/run_unittests_java.sh](assets/run_unittests_java.sh). Read it first — every script you produce must be a faithful translation of that pattern into the target language's tooling **and** the user's shell environment. There are also Windows PowerShell equivalents of these scripts in [assets/run_unittests_*.ps1](assets/run_unittests_*.ps1).

## Pick the Shell First

Before writing anything, decide which shell flavor the script must target — it depends on the user's environment, not on the language:

- **Bash (`.sh`)** — macOS, Linux, WSL, CI runners on Linux. Default unless the user is on native Windows.
- **PowerShell (`.ps1`)** — native Windows / PowerShell-only environments.

If you can't tell from the project (no obvious OS hints, no existing scripts), ask the user.

The same seven-step pattern applies to both. Only the syntax changes.

## The Pattern

Every testing script must implement these steps **in this order**:

1. **Toolchain check.** Verify that the required language runtime / build tool (and the required version, if any) is installed. If not, print an error and exit with code `69`.
2. **Argument validation.** Require exactly one positional argument: the source build folder. If missing, print usage and exit with code `1`. The renderer passes this argument as an **absolute path** (older renderer versions passed a relative one) — the script must work with both, which is why the working-folder name in step 3 is built from the argument's *basename*, never from the raw argument.
3. **Working directory setup.** Define a working folder in the **system temp directory**: `/tmp/<lang>_$(basename "$1")` in Bash, `Join-Path ([System.IO.Path]::GetTempPath()) "<lang>_$(Split-Path $BuildFolder -Leaf)"` in PowerShell (written as `<temp>/<lang>_<basename>` below). If it exists, wipe its contents; otherwise create it. Register cleanup so the folder is removed when the script exits — `trap 'rm -rf "$WORKING_FOLDER"' EXIT` in Bash, a `Remove-Item -Recurse -Force` in the `finally` block in PowerShell. This folder — and **only** this folder — is where every subsequent write must land.
4. **Copy the build.** Recursively copy everything from the source folder into the working folder. After this step the source folder (`$1`) is treated as **read-only** for the rest of the script.
5. **Enter the working directory.** `cd` / `Set-Location` into `<temp>/<lang>_<basename>`. If that fails, exit with code `2`. All remaining steps run from inside the working folder; they must never write back to the source build folder.
6. **Install dependencies into an isolated environment inside `<temp>/<lang>_<basename>`.** Set up a per-working-folder dependency location (a Python venv at `./.venv`, a local `./node_modules`, a project-scoped Maven repo at `./.m2`, etc.) and install/resolve all dependencies into it. **Never** install into the source build folder, the user's global cache (`~/.m2`, system-wide `pip`, `~/.cargo`, `~/.npm`, ...), or anywhere outside `<temp>/<lang>_<basename>`. If the install command fails, propagate its exit code immediately and **do not** proceed to step 7. See [Dependency isolation](#dependency-isolation) for per-language specifics.
7. **Run the tests.** Invoke the language's standard test command (e.g. `mvn test`, `pytest`, `npm test`, `go test ./...`, `cargo test`), pointed at the same isolated environment from step 6. The script's final exit code is whatever the test command returns.

### The build folder is read-only — hard rule

The source build folder passed in as `$1` is **input only**. The script must never:

- install dependencies into it (no `pip install` inside `$1`, no `npm install` inside `$1`, no `mvn install` writing into `$1`, no Cargo build artifacts ending up under `$1`),
- write a virtualenv / `node_modules` / `.m2` / `.gocache` / `.cargo` directory inside it,
- run the test command from inside it (every test command runs from inside `<temp>/<lang>_<basename>` after the `cd` in step 5),
- create logs, caches, build outputs, or temp files inside it.

The build folder is shared with the renderer (`plain_modules/<module>/code` by default) and downstream tooling. Writing into it corrupts the renderer's view of "what was generated" and breaks subsequent renders. Every write must go into `<temp>/<lang>_<basename>` — the whole point of staging into the system temp directory is so the source build folder stays a clean, reproducible artifact of the render and no build debris is left inside the user's project.

If you find yourself about to issue any command whose `cwd` is the source folder, or whose target path starts with `$1/`, **stop**. Either move the operation into `<temp>/<lang>_<basename>`, or you're doing something the script must not do.

## Conventions

Shared across both shell flavors:

- **Exit codes:**
  - `1` — bad usage (missing argument).
  - `2` — filesystem problem (couldn't enter the working folder).
  - `69` — required toolchain / runtime is not installed.
  - Any other non-zero code — propagated from the underlying test command.
- **Working folder naming:** `<temp>/<lang>_<basename>` — the system temp directory (`/tmp` in Bash, `[System.IO.Path]::GetTempPath()` in PowerShell) plus a short identifier for the language (`java`, `python`, `node`, `go`, `rust`, ...) and the **basename** of the build-folder argument (`$(basename "$1")` / `Split-Path $BuildFolder -Leaf`). Never embed the raw argument in the path — it may be absolute, and concatenating it produces broken doubled paths. All dependency installs, build outputs, caches, and the test run itself live inside this folder. Nothing the script does should touch the source build folder after step 4.
- **Cleanup on exit:** the working folder is temporary — remove it when the script exits, on success and failure alike (`trap 'rm -rf "$WORKING_FOLDER"' EXIT` in Bash; `Remove-Item -Recurse -Force` in the PowerShell `finally` block, after `Pop-Location`). No leftover build folders may accumulate in the temp directory or the user's project.
- **Logging — be as verbose as possible.** The script is the only thing the operator sees between a render and a green/red test result; when it fails, the only forensic evidence anyone has is its stdout/stderr. Treat the script like a production runbook, not a quiet helper. Concretely:
  - **Announce every step before doing it**, with the exact value of every variable involved — the resolved source folder, the working folder, the language, the toolchain version detected, the isolation root, the dependency-manifest path, the test command about to run. "Installing dependencies" alone is useless; "Installing dependencies from `./requirements.txt` into venv `./.venv` (Python 3.11.6 at `/usr/local/bin/python3`)" is triage-ready.
  - **Echo every non-trivial command before executing it.** In Bash, use `set -x` for the body of the script (or `echo "+ <cmd>"` immediately before each call); in PowerShell, set `$VerbosePreference = 'Continue'` and use `Write-Verbose` / `Write-Host` to print each command line with its arguments.
  - **Print clear section banners.** Each of the seven steps gets a banner like `===== [3/7] Working directory setup =====` so a long log can be navigated by eye.
  - **Print resolved absolute paths**, not just the relative names. Operators reading the log on a different machine need to know where things actually landed.
  - **Print the toolchain's own `--version` output** (and the path it resolved from) during step 1, even on success. This is the single most useful piece of forensic data when a test passes locally but fails in CI.
  - **Surface the install command's output verbatim** — do not pipe it to `/dev/null`, do not redirect to a log file inside the working folder. The operator must see every dependency-resolver line in the script's own output stream.
  - **On failure, print what was about to run before exiting** — the exact command, the working directory, the relevant environment variables (`PYTHONPATH`, `NODE_PATH`, `GOMODCACHE`, `CARGO_HOME`, `MAVEN_OPTS`, `PATH`).
  - **Print a final summary line** that names the test command, the exit code, and the working folder so the operator knows exactly what to re-run by hand if needed.
  Verbosity is not noise here — a chatty script that documents itself in its own output is the difference between a 30-second triage and a 30-minute one. Never trade verbosity for terseness.

### Dependency isolation

The dependency environment must live **inside** `$WORKING_FOLDER` so the test run can't be polluted by — or pollute — the user's global caches. Pick the most idiomatic isolation mechanism for the language:

| Language | Isolation mechanism | Install command (run inside `$WORKING_FOLDER`) | Test command |
|---|---|---|---|
| Python | `venv` at `./.venv` | `python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt` (or `pyproject.toml` / `uv sync` / `poetry install`) | `./.venv/bin/pytest` (or `./.venv/bin/python -m pytest`) |
| Node.js | local `./node_modules` (default) | `npm ci` (preferred) or `npm install` | `npm test` |
| Java | project-scoped Maven repo at `./.m2` | `mvn -Dmaven.repo.local=./.m2 dependency:resolve` (optional pre-warm) | `mvn -Dmaven.repo.local=./.m2 test` |
| Go | module cache at `./.gocache` | `GOMODCACHE="$PWD/.gocache" go mod download` (optional pre-warm) | `GOMODCACHE="$PWD/.gocache" go test ./...` |
| Rust | cargo home at `./.cargo` | `CARGO_HOME="$PWD/.cargo" cargo fetch` (optional pre-warm) | `CARGO_HOME="$PWD/.cargo" cargo test` |

Notes:

- **Every path in the install command and test command is relative to `<temp>/<lang>_<basename>`.** That's why the script `cd`s into the working folder in step 5 — from that point on, `./.venv`, `./node_modules`, `./.m2`, etc. all resolve under `<temp>/<lang>_<basename>`, never under the source build folder.
- **Always pass the isolation flag/env var to both the install command and the test command** — they must agree on where deps live, otherwise the test command will silently fall back to the global cache **or** (worse) the source build folder.
- **Python is the only ecosystem where the venv is mandatory** to satisfy "into a virtual environment" literally. The others use language-native equivalents that achieve the same isolation.
- **Pre-warming is optional for Java/Go/Rust** — their test commands will fetch deps on demand. Doing it as a separate step makes failures easier to diagnose and gives a clean "install failed vs test failed" signal.
- **Don't activate the venv** in Bash via `source .venv/bin/activate` — call `./.venv/bin/<tool>` directly. It's more portable and avoids subshell weirdness. In PowerShell, use `& .\.venv\Scripts\<tool>.exe` similarly.
- **Propagate the install exit code immediately.** In Bash: `<install cmd> || exit $?`. In PowerShell: check `$LASTEXITCODE` and `exit $LASTEXITCODE` if non-zero.

### Bash specifics

- **Shebang:** `#!/bin/bash`.
- **File naming:** `run_unittests_<lang>.sh`, placed in `assets/`.
- **Argument:** `$1`.
- **Make it executable:** `chmod +x assets/run_unittests_<lang>.sh`.

### PowerShell specifics

- **No shebang.** Use a `param([Parameter(Mandatory=$true)][string]$Subfolder)` block at the top instead.
- **File naming:** `run_unittests_<lang>.ps1`, placed in `assets/`.
- **Exit codes:** use `exit 69` etc. (PowerShell honors them just like Bash).
- **Toolchain check:** prefer `Get-Command <tool> -ErrorAction SilentlyContinue` and, where a specific version is needed, parse the tool's `--version` output.
- **Filesystem:** use `Test-Path`, `Remove-Item -Recurse -Force`, `New-Item -ItemType Directory`, `Copy-Item -Recurse`, `Set-Location`. Quote paths to handle spaces.
- **No `chmod` step needed.** If execution policy is likely to block the script, mention `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` to the user — don't bake it into the script.

## Workflow

1. Confirm the target **language**, **shell flavor** (Bash or PowerShell), and **dependency manifest** (`pom.xml`, `requirements.txt` / `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, ...). Ask if any is unclear.
2. Read [assets/run_unittests_java.sh](assets/run_unittests_java.sh) to refresh the exact structure.
3. Translate each of the seven steps above into the equivalent commands for the target language **and** shell. The toolchain check, dependency install, and test invocation are the language-specific parts; the rest is mechanical translation between Bash and PowerShell syntax.
4. Pick the dependency-isolation mechanism from the [Dependency isolation](#dependency-isolation) table and use it consistently in both step 6 and step 7.
5. Save the new script to `assets/run_unittests_<lang>.sh` or `assets/run_unittests_<lang>.ps1`. For Bash, `chmod +x` it.
6. **Update `config.yaml` to reference the new script.** Add or update the `unit-tests-script:` key with the path to the newly created script (e.g., `unit-tests-script: test_scripts/run_unittests_<lang>.sh`). This is mandatory — the renderer needs this reference to invoke the unit test script during the development workflow.
7. **Link the script into the base `.plain` files as a linked resource.** Once the script exists on disk, it must be referenced from the project's base `.plain` module(s) into its ***implementation reqs*** section using the `add-resource` skill. After linking, read the spec back to confirm the link path resolves to the script you just wrote.

## Anti-Patterns

- **(Hard mistake) Don't install into, build into, or otherwise write to the source build folder.** The build folder passed as `$1` is read-only input. Every install, cache, build artifact, log, and temp file must land in `<temp>/<lang>_<basename>`. This includes never running `pip install`, `npm install`, `mvn install`, or `cargo build` with the source folder as their `cwd` or target, never letting a venv / `node_modules` / `.m2` / `.gocache` / `.cargo` directory appear inside the source folder, and never running the test command from inside it. The whole point of staging the build into the system temp directory is so the source folder remains a clean, reproducible artifact of the render — writing to it corrupts the renderer's view and breaks subsequent renders.
- **(Hard mistake) Don't build any path by concatenating the raw build-folder argument.** `$1` arrives as an absolute path from current renderers. Patterns like `WORKING_FOLDER=.tmp/$1`, `WORKING_FOLDER=<lang>_$1`, or `"$current_dir/$1"` silently produce doubled paths (`/project//abs/path/...`) — the classic symptom is an `ImportError: Start directory is not importable` or "folder does not exist" pointing at a path that contains the project root twice. Always take `$(basename "$1")` / `Split-Path -Leaf`.
- Don't skip the toolchain check, even when "everyone has it installed" — exit code `69` is what the calling system relies on to detect a missing runtime.
- Don't reuse the source folder in place. Always copy into `<temp>/<lang>_<basename>` first; the renderer relies on this isolation.
- Don't leave the working folder behind. Register the cleanup (`trap … EXIT` / `finally`) before the first write so even an early failure removes it.
- Don't change the exit-code contract. Other parts of the system branch on `1`, `2`, and `69` specifically — and these codes must be identical between the Bash and PowerShell variants.
- Don't write a cross-shell hybrid (e.g. a `.sh` that detects PowerShell, or vice versa). Ship one script per shell, named with the appropriate extension.
- Don't install dependencies into the user's global location (`~/.m2`, system-wide `pip`, `~/.cargo`, etc.). Always isolate inside `$WORKING_FOLDER` so concurrent runs and other projects can't interfere.
- Don't run the test command without first verifying the install step succeeded. A failed install followed by a "test" run produces misleading errors that look like test failures.
- **Don't forget to update `config.yaml`.** After creating the unit test script, always add or update the `unit-tests-script:` key in `config.yaml` to reference the new script. Without this entry, the renderer won't know where to find the unit test script.
- **Don't forget to link the script as a resource in the base `.plain` files.** A script that is referenced only from `config.yaml` is invisible to the spec contract — the renderer treats `unit-tests-script:` as a build-system pointer, not as part of the test-req contract the model reads. Use the `add-resource` skill to add a markdown link to the script from the `.plain` module that owns the unit-testing test reqs (see Workflow step 7). Omitting the linked resource means the model authors and reviews test-related code without ever seeing the actual runner it has to satisfy.
- **Don't write a terse script.** Silent steps, `>/dev/null` redirects on the install output, missing `--version` prints, and absent failure banners all make the script harder to debug than the code it is testing. Follow the *Logging — be as verbose as possible* rule under [Conventions](#conventions) literally: every step announces itself, every command is echoed, every failure prints what was about to run and where.
