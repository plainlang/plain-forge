---
name: init-plain-project
description: >-
  Lightweight initializer for a new ***plain project. Asks about the base
  technology and project kind, asks whether conformance testing is enabled,
  then scaffolds a template import module (with base implementation reqs and
  test reqs), a stub top-level module, the unit testing script, and
  (optionally) the conformance and prepare-environment scripts plus a
  config.yaml. Does NOT run `plain-healthcheck`. Use when the user wants a
  quick project skeleton to start writing functional specs against, without
  the full forge-plain interview.
---

# Init Plain Project

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet.

## Scope

This skill is intentionally **minimal**. It produces a runnable project skeleton — not a complete spec. **No `***definitions***` sections are written by this skill — not in the template module, not in the top module.** No functional specs, no concepts, no acceptance tests, no validation. The user will fill those in afterwards with `add-feature`, `add-concept`, `add-functional-spec`, etc.

What this skill writes:

- `template/base.plain` — an import module with the project's base `***implementation reqs***` and `***test reqs***`.
- `<project>.plain` — a top-level module that imports `base`. Frontmatter only — no body sections. The user adds `***functional specs***` later.
- `test_scripts/run_unittests_<lang>.<sh|ps1>` — always.
- `test_scripts/run_conformance_tests_<lang>.<sh|ps1>` — only if conformance testing is enabled.
- `test_scripts/prepare_environment_<lang>.<sh|ps1>` — only if conformance testing is enabled **and** the user opts in.
- `config.yaml` at the project root — wired to whichever scripts were generated.

What this skill does **not** do:

- Run `plain-healthcheck`.
- Author concepts, functional specs, or acceptance tests.
- Probe the host environment (`check-plain-env` is a separate step the user can run later).

## Workflow

### 1. Ask the project basics

Use **AskUserQuestion** for one tight batch covering:

- **Project name** — used as the top module filename and as `:AppName:` later. Free-form.
- **Base technology** — programming language and primary framework (e.g. Python + FastAPI, Node.js + Express, Go + net/http, Java + Spring Boot). Offer the most common stacks plus free-form.
- **Project kind** — CLI tool, web app, REST API / backend service, library, desktop app, mobile app, other. Offer the common kinds plus free-form.

Follow up with a free-form prompt for anything the options didn't cover (e.g. specific Python version, monorepo layout).

### 2. Ask about testing

Use **AskUserQuestion** for one tight batch covering:

- **Unit testing framework** — propose the canonical one for the chosen language (pytest, Jest, Go `testing`, JUnit, ...) and let the user override.
- **Conformance testing** — enabled or not. If the user is unsure, briefly explain it adds a `run_conformance_tests` script and per-spec acceptance tests later.
- **Prepare-environment script** — only ask this if conformance testing was enabled in the previous question. Generate one or skip. Recommend "yes" when dependencies need installing (most stacks); recommend "skip" when there is genuinely nothing to set up. If conformance testing is disabled, skip this question entirely and do not generate a prepare-environment script.

### 3. Author `template/base.plain`

Create the import module with `create-import-module`. It must contain:

- `***implementation reqs***` — the base stack as requirements **and everything about `:UnitTests:`**:
  - Programming language and version.
  - Primary framework (if any).
  - Dependency / package manager.
  - Project kind as a constraint (e.g. ":Implementation: should be a REST API service.").
  - `:UnitTests:` framework (pytest / Jest / JUnit / Go's `testing` / …) and the command used to run them — phrased in terms of `:UnitTests:` so the partition is explicit.
  - Anything else the user added in the free-form catch-all.
- `***test reqs***` — the base **conformance**-testing rules (only added if conformance testing is enabled):
  - ":ConformanceTests: must be implemented and executed - do not skip tests."
  - The `:ConformanceTests:` framework and the command used to run them.
  - **Do NOT** put unit-test framework / command here — that lives in `***implementation reqs***` above.

Do **not** add a `***definitions***` section to `template/base.plain`. This skill does not author any concepts. Use only the predefined concepts (`:Implementation:`, `:ConformanceTests:`) in the reqs — no project-specific concepts like `:AppName:` or `:App:`. Do not declare `required_concepts` either.

Do **not** add `***functional specs***` to `template/base.plain` — it is an import module.

### 4. Author the top module `<project>.plain`

Create it at the repo root with frontmatter:

```yaml
---
import:
  - base
description: <one-line project description>
---
```

Body: **none**. The file ends after the closing `---` of the frontmatter. Do **not** add `***definitions***`, do **not** add `***functional specs***`, do **not** add any other section. The user will add `***functional specs***` later via `add-functional-spec` / `add-functional-specs`, and any concepts via `add-concept`.

The file must still be created on disk — an empty body is fine, but the file itself is required.

### 5. Generate the testing scripts

Call the corresponding implementation skills in order. Each skill knows how to write the right Bash or PowerShell variant for the host OS.

- `implement-unit-testing-script` — always.
- `implement-conformance-testing-script` — only if conformance testing was enabled. If a prepare-environment script will also exist, choose the **activate-only** variant; otherwise the **install-inline** variant.
- `implement-prepare-environment-script` — only if conformance testing was enabled **and** the user opted in.

### 6. Write `config.yaml`

Create `config.yaml` at the project root with **only the keys for scripts that were actually generated**. Valid keys:

```yaml
unittests-script: test_scripts/run_unittests_<lang>.<sh|ps1>
conformance-tests-script: test_scripts/run_conformance_tests_<lang>.<sh|ps1>
prepare-environment-script: test_scripts/prepare_environment_<lang>.<sh|ps1>
template_dir: template
```

Always include `template_dir: template` because the project has a template import module from step 3. Use `.sh` on macOS/Linux and `.ps1` on Windows, matching whatever the implement-* skills produced.

Do **not** invoke `init-config-file` or `plain-healthcheck` here — keeping this skill light is the whole point. The user can run them later if they want a strict canonicalization or validation.

### 7. Recap

Tell the user what was created and what's next:

- Files written: `template/base.plain`, `<project>.plain`, the test scripts, `config.yaml`.
- Suggested next steps: add concepts with `add-concept`, add functional specs with `add-functional-spec` or `add-functional-specs`, or jump straight into `add-feature`.
- Mention that the project has not been validated — they can run `plain-healthcheck` when they want validation.

## Validation checklist

Before the recap, walk `references/checklist.md` and confirm every box is met. It is a self-audit of this workflow — never a substitute for it. A box only counts as met when the file is on disk as described; complete any unmet step before recapping.

## Question style

Use simple grammatical structures: short direct sentences, one idea per sentence, plain words over jargon. Keep every constraint and edge case the user needs to answer accurately.
