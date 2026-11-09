# Phase 3 — Write the unit as ***plain

The goal is a set of `.plain` modules that, once rendered, replace the unit's code without the rest of the host noticing.

## Before writing

- Through `load-plain-reference`, load the rules for every section written below. A captured unit is embedded in its host, so the router also sends you to `rules/host-embedded.md` and `rules/integration-embedded-testing.md`. If the unit calls a REST API, third-party or internal, the integration rules apply as well.
- Write what the code does at the captured commit. The code answers most questions; read it before asking.
- Verify every resource adopted from an existing project against the code, claim by claim, before linking it. A resource written for a replacement of the unit can describe behavior the unit's code does not have. Each divergence is a "behavior looks unintended" question; the unit then links its own copy under `resources/<module>/`, corrected as the user decided, and the adopted file stays as it is.
- Keep a running list of func-ids and the source files each was written from. It becomes `functionalities` in the manifest in Phase 5.

## Layout

All files live in `plain/` at the host root (an existing ***plain project there is adopted as it is):

| Path | Holds |
|---|---|
| `template/host_context.plain` | Import module shared by every captured unit of this host: the host codebase concept, the host stack, and host-wide conventions. Created once, updated in place. |
| `<module>.plain` | Root module of the unit; imports `host_context`. A large unit is a chain of modules joined by `requires`, one per sub-level. |
| `tests/<module>/<func-id>.plain` | Test plain files, when conformance tests are on. |
| `resources/host/` | Copies of the host files the specs link, each at its path in the host (`resources/host/lib/...`). The renderer receives only `plain/`, so nothing outside it is ever linked. |
| `resources/` (elsewhere) | Artifacts no host file holds (a captured provider response, a provider contract). |
| `test_scripts/`, `config.yaml` | The test scripts and renderer configuration. |
| `capture.json` | The capture manifest. |

When the unit has its own part folder (`plain/<module>/`, see SKILL.md Step 0), its module, `config.yaml`, `test_scripts/`, and `tests/` live there, `template-dir` is `../template`, and every link to a shared resource starts with `../`. Links inside `template/host_context.plain` resolve from the folder of the module being rendered, so write them for that depth (`../resources/host/...`) and keep every part folder at the same depth.

## Steps

Write each step to disk immediately through the named skill, then review it (see *Review* below) before the next step.

1. **Host context.** If `template/host_context.plain`, or an adopted import module that holds only host-wide facts, exists and still matches the host, keep it and update it in place. Otherwise create `template/host_context.plain` with `create-import-module`, then `add-concept` for the host codebase concept and the environment variables test scripts use to reach the host, and `add-implementation-requirement` for the host stack and conventions, transcribed from the Phase 1 facts. When a copied lint or build configuration pulls rules from gems or files outside `plain/`, also write the effective rules as requirements: the renderer sees the copy, not what it loads. Changing an existing host context changes every captured unit that imports it, although `status` sees no host change: name those units in the final report, and tell the user each needs a render and a review before it counts as up to date again.
2. **Interface and boundary.** With `add-concept`, define the unit's interface: copy the host files that define it to `resources/host/<host path>` and link the copies. Define each host symbol the unit uses by its fully qualified name, marked as imported from the host and not to be redefined. The interface is the contract with the rest of the host: names, signatures, the errors callers catch, and the side effects callers rely on must all survive regeneration.
3. **Domain concepts.** With `add-concept`, define the unit's own concepts, before any spec that uses them.
4. **Functional specs.** With `add-functional-specs`, write one functionality per behavior observable through the interface:
   - derive them from the entry points, the branches and error paths reachable from them, and the assertions in the host's tests of the unit;
   - name each func-id after the behavior;
   - record the source files of each func-id in the running list.
5. **Implementation reqs.** With `add-implementation-requirement`, write how the unit is built where the host context does not already say it: libraries, patterns, data formats, error handling, and the paths and package of the unit's `:UnitTests:` inside the host.
6. **REST APIs.** If the unit calls a REST API — a third party's or one of the host organization's own services — follow the integration rules for its contract: the API's surface goes in `resources/`, cross-checked against the live API.
7. **Testing.** Every unit gets its unit-test runner and `config.yaml`, with or without conformance tests:
   - generate the unit-test runner with `implement-unit-testing-script`, staging the rendered unit into the host as `rules/integration-embedded-testing.md` describes. A captured unit's render lands on the host's own files, so every staging script backs them up first, restores them on exit, and checks that the process running the tests sees the staged files;
   - put the rendered `:UnitTests:` where Phase 2 decided, and run the host's own tests of the unit with them when they stay;
   - when the user wants conformance tests, or the host already tests the unit: with `add-test-requirement`, state that `:ConformanceTests:` run through the host's own test runner against the host with the rendered unit staged into it; with `add-test-scenarios`, write a test plain file per functionality, turning the host's existing tests of the unit into scenarios and adding one where no test covers the functionality; and generate the conformance (and, if needed, prepare-environment) scripts the same way;
   - build `config.yaml` with `init-config-file`.
8. **Manifest.** In the unit's entry in `plain/capture.json`, write `functionalities` from the running list, and `render_map` from the paths the test scripts copy the rendered unit to (see `references/manifest.md`). A unit file that no func-id describes is either wiring only (say so in the review) or a missed functionality (go back to step 4).

## When to ask

Capture is not an interview. Ask one question, showing the code excerpt with file and line, only when:

- **behavior looks unintended** (an error swallowed, a branch that can never run correctly) — options: write it as it is (default), write the intended behavior (the spec then differs from the code on purpose; list it in the final report), or leave it out;
- **code is unreachable from the interface** — options: leave it out (default) or write it;
- **a functional spec is too complex** — show the split `break-down-func-spec` proposes, and apply the user's answer;
- **behavior depends on configuration or environment the repository does not show** — ask for the value or the rule.

## Review

Review each step once, not each snippet; steps 1 to 3 (host context, interface, domain concepts) may share one review. After a step, show what it wrote — for functional specs, each func-id with one line and its source files — in one question with the options "Approve", "Correct an item", and a free-form catch-all. Apply a correction through the same skill, then show the corrected item again. Continue to the next step only after approval.
