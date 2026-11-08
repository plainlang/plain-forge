# Phase 3 — Write the unit as ***plain

The goal is a set of `.plain` modules that, once rendered, replace the unit's code without the rest of the host noticing.

## Before writing

- Through `load-plain-reference`, load the rules for every section written below. A captured unit is embedded in its host, so the router also sends you to `rules/host-embedded.md` and `rules/integration-embedded-testing.md`. If the unit calls a third party, the integration rules apply as well.
- Write what the code does at the captured commit. The code answers most questions; read it before asking.
- Keep a running list of func-ids and the source files each was written from. It becomes `functionalities` in the manifest in Phase 5.

## Layout

All files live in `plain/` at the host root (an existing ***plain project there is adopted as it is):

| Path | Holds |
|---|---|
| `template/host_context.plain` | Import module shared by every captured unit of this host: the host codebase concept, the host stack, and host-wide conventions. Created once, updated in place. |
| `<module>.plain` | Root module of the unit; imports `host_context`. A large unit is a chain of modules joined by `requires`, one per sub-level. |
| `tests/<module>/<func-id>.plain` | Test plain files, when conformance tests are on. |
| `resources/` | Only artifacts that no host file holds (a captured provider response, a provider contract). Host files are linked where they are, never copied here. |
| `test_scripts/`, `config.yaml` | The test scripts and renderer configuration. |
| `capture.json` | The capture manifest. |

## Steps

Write each step to disk immediately through the named skill, then review it (see *Review* below) before the next step.

1. **Host context.** If `template/host_context.plain` exists and still matches the host, keep it. Otherwise create it with `create-import-module`, then `add-concept` for the host codebase concept and `add-implementation-requirement` for the host stack and conventions, transcribed from the Phase 1 facts.
2. **Interface and boundary.** With `add-concept`, define the unit's interface and link, where they are, the host files that define it. Define each host symbol the unit uses by its fully qualified name, marked as imported from the host and not to be redefined. The interface is the contract with the rest of the host: names, signatures, the errors callers catch, and the side effects callers rely on must all survive regeneration.
3. **Domain concepts.** With `add-concept`, define the unit's own concepts, before any spec that uses them.
4. **Functional specs.** With `add-functional-specs`, write one functionality per behavior observable through the interface:
   - derive them from the entry points, the branches and error paths reachable from them, and the assertions in the host's tests of the unit;
   - name each func-id after the behavior, and order the specs so each builds only on earlier ones, the simplest first;
   - record the source files of each func-id in the running list.
5. **Implementation reqs.** With `add-implementation-requirement`, write how the unit is built where the host context does not already say it: libraries, patterns, data formats, error handling, and the paths and package of the unit's `:UnitTests:` inside the host.
6. **Third parties.** If the unit calls a provider, follow the integration rules for its contract: the provider's surface goes in `resources/`, cross-checked against the live API.
7. **Testing.** When the user wants conformance tests, or the host already tests the unit:
   - with `add-test-requirement`, state that `:ConformanceTests:` run through the host's own test runner against the host with the rendered unit staged into it;
   - with `add-test-scenarios`, write a test plain file per functionality, turning the host's existing tests of the unit into scenarios and adding one where no test covers the functionality;
   - generate the test scripts with the `implement-*-testing-script` skills, staging the rendered unit into the host as `rules/integration-embedded-testing.md` describes;
   - build `config.yaml` with `init-config-file`.
8. **Manifest.** In the unit's entry in `plain/capture.json`, write `functionalities` from the running list, and `render_map` from the paths the test scripts copy the rendered unit to (see `references/manifest.md`). A unit file that no func-id describes is either wiring only (say so in the review) or a missed functionality (go back to step 4).

## When to ask

Capture is not an interview. Ask one question, showing the code excerpt with file and line, only when:

- **behavior looks unintended** (an error swallowed, a branch that can never run correctly) — options: write it as it is (default), write the intended behavior (the spec then differs from the code on purpose; list it in the final report), or leave it out;
- **code is unreachable from the interface** — options: leave it out (default) or write it;
- **a functional spec is too complex** — show the split `break-down-func-spec` proposes, and apply the user's answer;
- **behavior depends on configuration or environment the repository does not show** — ask for the value or the rule.

## Review

Review each step once, not each snippet: after a step, show what it wrote — for functional specs, each func-id with one line and its source files — in one question with the options "Approve", "Correct an item", and a free-form catch-all. Apply a correction through the same skill, then show the corrected item again. Continue to the next step only after approval.
