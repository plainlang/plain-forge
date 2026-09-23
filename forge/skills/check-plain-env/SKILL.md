---
name: check-plain-env
description: >-
  Read a ***plain project — its `.plain` files, `test_scripts/`, `config.yaml`(s),
  and `resources/` — and determine every command-line tool, runtime, package
  manager, and external service the project needs on the host machine. Probe
  the host for each one, then emit a `PASS` / `FAIL` report listing what's
  installed (with versions), what's missing, and concrete OS-specific install
  commands for the gaps. Run this any time someone is about to render, test,
  or onboard onto a ***plain project for the first time.
---

# Check Plain Env

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet.

This skill answers one question: **does the host machine have everything the ***plain project needs to render and test?** It reads the project, derives the requirement list, probes the machine, and returns a report. It never installs anything itself — that decision belongs to the user.

## When to run

- **First time you open a ***plain project on a new machine** — before the first render or `./test_scripts/run_unittests*.sh` invocation. This is the most common case.
- **At the start of `forge-plain` Phase 3 environment verification** — `forge-plain` historically did this inline; delegate to this skill instead so the same check runs the same way everywhere.
- **After `add-feature`** — when the new feature brought in a new dependency (a new framework, a new service, a new package manager) the project didn't need before.
- **Before a real render** — alongside `plain-healthcheck`. `plain-healthcheck` answers "are the specs renderable?"; this skill answers "can this machine render them?". Both should pass.
- **Onboarding** — when a teammate (or CI runner, or fresh dev container) is about to start using the project.
- **Debugging a confusing failure** — when a test script exits with "command not found", "module not found", "could not connect", or similar before any test runs.
- **On demand** — whenever the user asks "what do I need to install for this project?".

This skill is **read-only and observational**. It does not edit `.plain` files, scripts, or configs, and it never invokes install commands on the user's behalf.

## What this skill does NOT do

- It does **not** install anything. It only suggests install commands and lets the user run them.
- It does **not** generate scripts, modify `config.yaml`, or change project files. Use `implement-*-testing-script`, `init-config-file`, etc. for that.
- It does **not** start services (databases, brokers, Docker daemons). It only checks whether the right binaries and (optionally) running endpoints are reachable.
- It does **not** validate the specs themselves (syntax, concepts, module graph). Use `plain-healthcheck` for that — the two skills are complementary.
- It does **not** print secrets. Check whether an env var is *set* (e.g. `printenv FOO >/dev/null && echo set || echo missing`), never echo its value.

## Workflow

The skill is a **derive → probe → report** pass. It does not stop at the first missing tool; it surfaces every gap so the user gets a single complete shopping list.

### Step 1 — Inventory the project

1. **Detect the host OS** first. Run `uname -s 2>/dev/null || echo "$OS"`. Use the result to (a) pick the right script extensions to inspect (`.sh` vs `.ps1`) and (b) pick the right install commands later (Homebrew, apt, dnf, pacman, choco, scoop, winget).
2. **List every `.plain` file** in the repo root and in any subdirectory that contains them. Note which are top modules (not `requires`-ed by anything) and which are import modules (under `template/`).
3. **List every `config.yaml`** in the repo and read each one. Note the `*-script` keys it sets and the values they point at.
4. **List every script under `test_scripts/`** (both `.sh` and `.ps1` — projects can ship both).
5. **List every file under `resources/`** if the directory exists. Schemas and protocol files there often imply running services (e.g. a Postgres `.sql` schema implies a Postgres server).
6. Print a one-line inventory summary, e.g. `Detected: 2 top modules (backend/api.plain, frontend/web.plain), 2 config.yaml(s), 4 test_scripts, 3 resources. Host: Darwin.`

### Step 2 — Derive the requirement list (at runtime, from what the project actually says)

The requirement list is **not pre-baked into this skill**. There is no catalog of "things to always check". The list is derived for each project from the project itself, by reading the specs and scripts in front of you and classifying every signal into one of the categories below.

#### What to check vs. what *not* to check

The single most important rule:

> **Check only the layers a package manager cannot install.** Anything `pip install -r requirements.txt`, `npm ci`, `mvn install`, `cargo fetch`, `go mod download`, `bundle install`, `composer install`, etc. would resolve is **out of scope** for this skill. It will be installed by the project's own scripts the moment they run. Checking it here is wasted work and creates false-negative reports the moment the manifest changes.

Concretely:

- ❌ **Do NOT check individual language packages** — not `torch`, not `requests`, not `numpy`, not `FastAPI`, not `express`, not `react`, not a specific JAR in `pom.xml`, not a specific gem in `Gemfile`, not a specific crate in `Cargo.toml`. The language's package manager handles all of it. The same rule applies in every language — Python, Node.js, Java, Go, Rust, Ruby, PHP, .NET, Dart, etc.
- ✅ **Do check the layers below the package manager**, which fall into four categories. Build the requirement list at runtime by walking through each category and adding only what the project actually needs.

#### Category 1 — Language toolchains and their package managers

For each language the project uses, the *toolchain* must be on the host — the package manager cannot install itself. Decide which toolchains apply by reading the specs and scripts:

- **Signals in `.plain` files**: phrases like `should be in Python`, `should be in Java`, `should be in Go` in `***implementation reqs***`. Find the language; ignore the framework (the framework is a package, not a toolchain).
- **Signals in `test_scripts/`** (more reliable, because scripts are the executable contract): which interpreter / build tool is invoked at the top level. `python3` / `pip` → Python toolchain. `node` / `npm` / `pnpm` / `yarn` → Node.js toolchain. `mvn` / `gradle` → JDK + Maven/Gradle. `go` → Go toolchain. `cargo` → Rust toolchain. `dotnet` → .NET SDK. `ruby` / `bundle` → Ruby + Bundler. `php` / `composer` → PHP + Composer. `dart` / `flutter` → Dart/Flutter SDK.

For each detected toolchain, probe both the interpreter/compiler **and** its package manager:

- Python → `python3 --version` + `pip --version`.
- Node.js → `node --version` + `npm --version` (or `pnpm`/`yarn` if the scripts use them).
- Java → `java -version` + `javac -version` + `mvn -version` (or `gradle --version`).
- Go → `go version`.
- Rust → `cargo --version` + `rustc --version`.
- .NET → `dotnet --version`.
- Ruby → `ruby --version` + `bundle --version`.
- PHP → `php --version` + `composer --version`.
- Flutter / Dart → `flutter --version` + `dart --version`.

**That's where the language-package check stops.** Once `python3` and `pip` are on the host, `pip install -r requirements.txt` will handle `torch`, `numpy`, `requests`, etc. when the test script runs. Don't probe for them here.

#### Category 2 — External services

Services that run as separate processes / daemons and cannot be installed by a language package manager. Identify them at runtime by reading the specs and config:

- **Signals**: a `.plain` file names a service the implementation talks to (database, cache, queue, broker, orchestrator). A `resources/*.sql` schema implies a database. A `docker-compose.yml` (if present) lists services explicitly.
- For each service found, probe **both** that its CLI is available **and** — when possible — that the service is reachable. "Binary present but service not running" should report as `WARN`, not `FAIL`; the user may want to start it on demand.

No catalog — if the spec says "uses PostgreSQL" you check Postgres, if it says "uses Redis" you check Redis, if it says "uses some-niche-service" you look up its CLI on the fly and probe that. Don't pretend the list is closed.

#### Category 3 — System binaries that language packages wrap

Some language packages are thin wrappers around a system binary that **`pip install` / `npm install` cannot install for you**. The package manager installs the wrapper; the wrapped binary still has to be on the host separately. This is the most commonly missed category.

Decide at runtime by reading the workflow described in the specs. If the workflow can't physically run without an external tool, that tool needs to be checked even though the language wrapper around it is in `requirements.txt`. Examples of the *pattern* (not an exhaustive list — derive yours from the actual project):

- The spec describes OCR → a wrapper like `pytesseract` is in `requirements.txt`, but the host still needs the `tesseract` binary and the language data files.
- The spec describes video/audio processing → `ffmpeg-python` is in the manifest, but the `ffmpeg` binary itself must be on the host.
- The spec describes PDF extraction → a Python wrapper is in the manifest, but the `pdftotext` / `pdftoppm` binaries from poppler-utils are still required.
- The spec describes headless-browser e2e testing → the npm package is in `package.json`, but the actual browser binaries (Chromium, Firefox, WebKit) must be downloaded onto the host separately.
- The spec describes shelling out to any external CLI from generated code → that CLI must be on the host.

**Heuristic for spotting Category 3:** if removing the package from `requirements.txt` would still leave a binary on the host that the project depends on, the binary belongs in Category 3. If the package *is* the only thing the project needs, it's package-manager territory and out of scope.

Whenever the test scripts themselves invoke a non-language binary (`ffmpeg`, `psql`, `docker`, `tesseract`, ...), that binary is automatically Category 3 — the script is the executable contract. **Always reconcile the spec-derived list against the scripts** before probing.

#### Category 4 — Hardware, drivers, accelerators

Things the OS — not any package manager — must provide. The only category where the chain runs deeper than "is this binary on PATH?".

- **Signals**: a spec mentions GPU acceleration, local model training/fine-tuning, real-time inference, CUDA, MPS / Apple Silicon, hardware-accelerated video encoding, etc.
- The check is **layered**, and each layer fails independently. Probe each one and surface each result separately, in order, so the user sees exactly where the chain breaks:
  1. **Driver present?** (e.g. `nvidia-smi` succeeds.)
  2. **Device visible?** (e.g. `nvidia-smi -L` lists ≥ 1 GPU.)
  3. **Accelerator SDK installed?** (e.g. `nvcc --version` for the CUDA toolkit.)
  4. **Acceleration libraries discoverable?** (e.g. cuDNN via `ldconfig -p \| grep libcudnn` on Linux.)
  5. **The runtime can actually see the accelerator?** (e.g. a one-line Python probe through whatever framework the spec named: `python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"`.) This particular layer **does** require the language package, so run it after the test scripts have had a chance to install dependencies — or surface it as "can be verified after `pip install`" if dependencies aren't installed yet.
  6. **Version compatibility.** If the runtime reports a different CUDA major version than the toolkit, surface a `WARN`. Driver / toolkit / runtime version mismatches are the most common silent GPU bug.

The same shape applies to other accelerators: Apple Silicon / MPS (`uname -m`, `sw_vers`, framework probe), AMD ROCm (`rocminfo`), Intel oneAPI, etc. Look up the relevant probe at runtime from the spec's terminology.

Worked example — the GPU case:

> A `.plain` file declares: `:Implementation: should fine-tune :BaseModel: on the user's local hardware using PyTorch. Training should use available GPUs when present.`
>
> What the package manager handles (out of scope for this skill): `torch` itself. `pip install -r requirements.txt` will fetch the right wheel.
>
> What this skill must probe (in scope):
>
> 1. The **Python toolchain** (Category 1): `python3 --version`, `pip --version`.
> 2. The **NVIDIA driver** (Category 4, layer 1): `nvidia-smi`.
> 3. **At least one GPU visible** (Category 4, layer 2): `nvidia-smi -L` lists ≥ 1 device.
> 4. **CUDA toolkit** (Category 4, layer 3): `nvcc --version`.
> 5. **cuDNN discoverable** (Category 4, layer 4): `ldconfig -p \| grep libcudnn` on Linux; skip on macOS.
> 6. **PyTorch actually sees the GPU** (Category 4, layer 5): `python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"` — noting this requires `torch` to be installed (i.e. requires the test scripts to have run their install step at least once).
> 7. **Version match** (Category 4, layer 6): cross-check `torch.version.cuda` against `nvcc --version`. Mismatch → `WARN`.
>
> The skill never asks "is `torch` installed?". That belongs to `pip`.

#### Category 5 — Always required

Add these to every requirement list regardless of project:

- A shell matching the testing scripts' extension (Bash for `.sh`, PowerShell for `.ps1`).
- `git` (the renderer uses it; almost every plain project tracks itself in git).

### Step 3 — Probe the host

For every requirement the project produced in Step 2, run a check using the `terminal` tool. Capture stdout/stderr and exit code. Classify each result:

- **PASS** — present and (where a version was specified) at or above the required version.
- **WARN** — present but at a version that doesn't match what the project explicitly asks for (e.g. spec says Java 17, host has Java 21), or service binary present but the service itself isn't running, or a Category 4 sub-layer is mismatched against another (e.g. CUDA toolkit version doesn't match what the framework expects).
- **FAIL** — missing, unreachable, or below the minimum version.

Probe in the same category order Step 2 produced them, so the report reads top-down:

1. **Category 1 — Language toolchains.** Run the toolchain + package-manager probes listed in Step 2's Category 1 for the languages this project actually uses. Do not probe individual language packages.
2. **Category 5 — Shell and `git`.** Always required, independent of the project. `git --version`. Verify the shell flavor matches the scripts' extension; a `.sh`-only project on native Windows is a `FAIL` (suggest WSL).
3. **Category 2 — External services.** For each service identified at runtime, probe the CLI's presence first, then — if the CLI exists — check whether the service itself is reachable. Service binary present but daemon down → `WARN`, not `FAIL`.
4. **Category 3 — System binaries that language packages wrap.** For each one identified in Step 2, check the system binary is on `PATH` (`which <bin>` / `<bin> --version`). The wrapper package itself isn't probed.
5. **Category 4 — Hardware, drivers, accelerators.** Walk the layered probe from Step 2 in order (driver → device visibility → SDK → acceleration libs → framework-sees-it → version match), reporting each layer's result separately. Never collapse a multi-layer failure into a single "GPU not available" message — each layer has a different fix.
6. **Credentials and config holes.** For every env var, dotfile, or cloud CLI login state the project implies, probe its presence without printing its value: `printenv VAR >/dev/null && echo set || echo missing`, `[ -f <path> ] && echo present || echo missing`, `aws sts get-caller-identity` / `gcloud auth list` / `az account show` for cloud SDKs.

### Step 4 — Report

Emit a single report with **the verdict on the first line** so callers can pattern-match without parsing the body:

- **`PASS`** — every required item is present at an acceptable version. Follow with a one-paragraph summary listing what was checked.
- **`WARN`** — everything required is present but at least one item triggered a soft warning (version mismatch, service not currently running). Follow with the numbered list of warnings.
- **`FAIL`** — at least one required item is missing or below minimum version. Follow with a numbered list of every gap.

For every **FAIL** and **WARN** item, the report must include four columns:

| Column | Content |
|---|---|
| **What** | The missing tool/service/credential. |
| **Why** | Which spec, script, or library introduced this requirement (e.g. "`backend/api.plain` says `using FastAPI`", "`test_scripts/run_unittests_python.sh` calls `pytest`"). |
| **Status** | "missing", "outdated (found X, need Y)", "binary present but service not running", or "env var not set". |
| **How to install** | OS-specific command(s). See [Install suggestions](#install-suggestions) below. |

Group the report into the same six probe groups used in Step 3 (toolchains, shell/git, services, system binaries, hardware, credentials), so the user can fix one whole layer at a time.

End the report with a one-liner reminder: `Re-run check-plain-env after installing missing items to confirm.`

## Install suggestions

When emitting an install command, **match the host OS** detected in Step 1. Prefer the OS's first-party package manager. Don't suggest `curl | sh` style installs unless there is no alternative.

The tables below are a **starter set** of well-known install commands for the things projects most often need. They are **not** a list of "things to check" — that list is derived per project in Step 2. When the requirement list contains something not in these tables (e.g. a niche service, a specialty CLI), look up the canonical install command for the detected OS at the time of report generation rather than skipping the row or inventing a command.

### macOS (Darwin)

| Requirement | Suggested install |
|---|---|
| Python 3 | `brew install python@3.12` |
| Node.js | `brew install node` (or `brew install nvm` for multi-version) |
| Go | `brew install go` |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` (no Homebrew equivalent that stays current) |
| Java | `brew install openjdk@21` then follow the post-install `sudo ln -sfn ...` step |
| Maven | `brew install maven` |
| Gradle | `brew install gradle` |
| PostgreSQL | `brew install postgresql@16` then `brew services start postgresql@16` |
| MySQL | `brew install mysql` then `brew services start mysql` |
| Redis | `brew install redis` then `brew services start redis` |
| Docker | Install Docker Desktop from https://docker.com/products/docker-desktop |
| `pg_config` (psycopg) | comes with `brew install postgresql@16` |
| Xcode CLT | `xcode-select --install` |

### Linux (Debian/Ubuntu)

| Requirement | Suggested install |
|---|---|
| Python 3 | `sudo apt update && sudo apt install -y python3 python3-pip python3-venv` |
| Node.js | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` |
| Go | `sudo apt install -y golang-go` (or download from https://go.dev/dl/ for the latest) |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Java | `sudo apt install -y openjdk-21-jdk` |
| Maven | `sudo apt install -y maven` |
| PostgreSQL | `sudo apt install -y postgresql postgresql-contrib && sudo systemctl start postgresql` |
| Redis | `sudo apt install -y redis-server && sudo systemctl start redis-server` |
| Docker | follow https://docs.docker.com/engine/install/ubuntu/ |
| `pg_config` (psycopg) | `sudo apt install -y libpq-dev` |
| C/C++ build tools | `sudo apt install -y build-essential` |

### Linux (Fedora/RHEL)

Equivalent commands with `sudo dnf install -y ...` instead of `apt`. Surface them when the host is detected as Fedora/RHEL (e.g. presence of `/etc/redhat-release` or `dnf --version` succeeding).

### Windows (native PowerShell)

| Requirement | Suggested install |
|---|---|
| Python 3 | `winget install Python.Python.3.12` or `choco install python` |
| Node.js | `winget install OpenJS.NodeJS.LTS` or `choco install nodejs-lts` |
| Go | `winget install GoLang.Go` |
| Rust | `winget install Rustlang.Rustup` |
| Java | `winget install Microsoft.OpenJDK.21` |
| PostgreSQL | `winget install PostgreSQL.PostgreSQL` |
| Docker | `winget install Docker.DockerDesktop` |
| MSVC build tools | `winget install Microsoft.VisualStudio.2022.BuildTools` |

If the project's `test_scripts/` are `.sh` only and the host is native Windows, suggest **WSL** (`wsl --install`) rather than trying to make Bash scripts run under PowerShell.

### When you can't pick

When the host OS detection in Step 1 was inconclusive (e.g. an unrecognized Linux distro), include the macOS and Debian/Ubuntu commands and tell the user to adapt for their package manager. Never invent install commands for a distro you can't identify.

## Anti-patterns

- **(Hard mistake) Don't probe individual language packages.** Anything `pip install -r requirements.txt`, `npm ci`, `mvn install`, `cargo fetch`, `go mod download`, `bundle install`, `composer install`, etc. would resolve is out of scope. `torch`, `requests`, `numpy`, `FastAPI`, `express`, `react`, JARs, gems, crates — all package-manager territory. Check the toolchain (`python3`, `pip`, `node`, `npm`, `mvn`, `cargo`, ...) and stop there. Probing the package itself creates false negatives the moment `requirements.txt` changes and duplicates work the test scripts will do anyway.
- **Don't stop after the directly named technologies.** A spec that says "fine-tune on local hardware using PyTorch" never says "CUDA", but the workflow can't run without CUDA. Always work through Category 3 (system binaries that language packages wrap) and Category 4 (hardware/drivers) — not only the directly named runtimes. These categories are where the workflow's hidden requirements live.
- **Don't merge a chain of failures into one generic message.** "GPU not available" is not a useful report. The chain is `driver → device visibility → toolkit → acceleration libs → framework-sees-it → version match`; each layer has a different fix. Surface each layer separately.
- **Don't work only from `.plain` files.** Always cross-reference with `test_scripts/` — the scripts are the executable contract. If a script invokes a non-language binary the specs never mention, that binary is automatically a Category 3 requirement.
- **Don't pre-bake a catalog.** Derive the requirement list at runtime from the project in front of you. A hard-coded "things to always check" table becomes wrong the moment any project deviates from the assumed shape — and every project does.
- **Don't probe testing framework binaries as if they were independent.** `pytest`, `jest`, `vitest`, `phpunit`, `junit-console`, etc. are installed by the package manager via `requirements.txt` / `package.json` / `pom.xml`. The toolchain check (Category 1) is enough — the framework binary itself is out of scope.
- **Don't probe in silence.** Use the `terminal` tool and capture the actual command output (version strings, exit codes). Telling the user "looks like Python is installed" without running `python3 --version` is guessing.
- **Don't print secret values.** Check whether `DATABASE_URL`, API keys, etc. are set, not what they contain. Use `printenv VAR >/dev/null` not `printenv VAR`.
- **Don't install anything on the user's behalf.** Even when the install command is obvious. The user needs to opt in.
- **Don't stop at the first FAIL.** Run the full sweep so the report is complete in one pass.
- **Don't suggest `curl | sh` installs when a package manager works.** Reserve the upstream installer fallback for cases where no package-manager option exists (e.g. `rustup`, sometimes Go).
- **Don't ignore version mismatches.** If a spec says Java 17 and the host has Java 21, surface that as a `WARN` so the user can decide — don't silently let it pass.
- **Don't duplicate this check inline elsewhere.** Other skills (`forge-plain`, `add-feature`, `plain-healthcheck`) that need an env check should **delegate to `check-plain-env`** rather than re-implementing the probe themselves. This skill is the single source of truth.

## Validation Checklist

- [ ] Host OS detected (`uname -s` / `$OS`) before any other action.
- [ ] Requirement list derived **at runtime from this project's** `.plain` files, `test_scripts/`, `config.yaml`(s), and `resources/` — no pre-baked catalog used.
- [ ] **No individual language packages probed.** Only the toolchain + package manager for each detected language.
- [ ] Every script under `test_scripts/` opened and read; every non-language binary it invokes added to the Category 3 list.
- [ ] Every external service named in the specs is in the Category 2 list, with both a binary probe and (when feasible) a reachability probe.
- [ ] Every hardware / accelerator signal ("GPU", "fine-tune", "local inference", "CUDA", "MPS", etc.) triggered the layered Category 4 probe.
- [ ] Every requirement probed via the `terminal` tool with an actual version / availability command (no "looks installed" guesses).
- [ ] GPU / accelerator chains probed layer-by-layer (driver → device visibility → toolkit → acceleration libs → framework-sees-it → version match), with each layer reported separately.
- [ ] Each result classified as PASS / WARN / FAIL.
- [ ] Report has the verdict on the first line.
- [ ] Every FAIL and WARN row has all four columns: What / Why / Status / How to install.
- [ ] Install suggestions match the detected host OS (no Debian commands on macOS, no `brew` on Linux, etc.).
- [ ] No secret values were printed at any point.
- [ ] Nothing was installed; no project files were modified.
