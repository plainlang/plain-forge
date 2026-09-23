# Init Plain Project Workflow Checklist

Use this to verify the scaffold was produced correctly — never as a substitute for the workflow. Run it once before the recap. This skill is intentionally minimal: it writes a runnable skeleton, not a complete spec. If a box is unmet, go back and complete the step.

## Setup

- [ ] Invoked `load-plain-reference` first (unless already loaded this session).

## Ask the basics

- [ ] Asked project basics in one `AskUserQuestion` batch (project name, base technology, project kind) plus a free-form catch-all.
- [ ] Asked testing in one `AskUserQuestion` batch (unit-test framework, conformance on/off, and prepare-environment only if conformance was enabled).

## Author the modules

- [ ] Created `template/base.plain` via `create-import-module` with `***implementation reqs***` (language/version, framework, package manager, project kind, and everything about `:UnitTests:` — framework + run command).
- [ ] Added `***test reqs***` to `template/base.plain` with the `:ConformanceTests:` rules **only** when conformance testing is enabled — and kept unit-test facts out of it.
- [ ] No `***definitions***`, no `***functional specs***`, and no project-specific concepts in `template/base.plain`; only predefined concepts (`:Implementation:`, `:ConformanceTests:`) used; no `required_concepts` declared.
- [ ] Created `<project>.plain` at the repo root with frontmatter only (`import: [base]`, `description`) and **no body sections** — the file exists on disk.

## Generate scripts and config

- [ ] Generated `implement-unit-testing-script` (always).
- [ ] Generated `implement-conformance-testing-script` only if conformance was enabled (activate-only variant when a prepare-environment script will also exist, otherwise install-inline).
- [ ] Generated `implement-prepare-environment-script` only if conformance was enabled **and** the user opted in.
- [ ] Wrote `config.yaml` at the project root with only the keys for scripts actually generated, plus `template_dir: template`, using the correct `.sh`/`.ps1` extension for the host OS.
- [ ] Did **not** run `init-config-file`, `plain-healthcheck`, or `check-plain-env` (out of scope for this skill).

## Recap

- [ ] Told the user what was written, suggested next steps (`add-concept`, `add-functional-spec(s)`, `add-feature`), and noted that the project was not validated (they can run `plain-healthcheck` later).
