# Capture review checklist

The Phase 4 review agent runs this list. Check each item by its tag: `[disk]` against the files, `[record]` against the evidence record in the spawn prompt, `[both]` by cross-checking the two and reporting any mismatch. Return `APPROVED`, or a numbered list of the unmet items with what is missing.

## Scan and choice

- [ ] `[record]` When an existing ***plain project was adopted, its pre-existing `plain-parser` failures were shown to the user before anything was written, and the user chose to proceed.
- [ ] `[record]` The intent was stated or confirmed before scanning.
- [ ] `[both]` Every question in the evidence record, with its answer, is in `answers` in `plain/capture.json` (the unit's, or the project's for Step 0), and the unit's `intent` is set.
- [ ] `[disk]` `scan.commit` in `plain/capture.json` is the commit the unit was captured from, and every candidate has paths, an interface with file and line, a boundary, tests, state, and fit.
- [ ] `[record]` The user chose the unit, and answered: every kind of leak, every piece of state it writes and reads back (keys in host-owned records included), and, when the host tests the unit, where the rendered `:UnitTests:` go.
- [ ] `[disk]` The unit's `paths`, `exclude`, and `boundary` in the manifest match the chosen candidate and those answers; every leak site and every host test of the unit kept as an oracle is in the boundary.

## Specs

- [ ] `[disk]` `template/host_context.plain` exists and transcribes the host stack and conventions; every host file the specs need is copied unchanged to `resources/host/<host path>` and linked there, and no link leaves `plain/`.
- [ ] `[disk]` The unit's interface is a concept that links the host files defining it; each host symbol is named by its fully qualified name and marked as imported from the host.
- [ ] `[both]` Every interface entry point from the scan is covered by at least one func-id.
- [ ] `[disk]` Every functional spec describes behavior observable through the interface, has a func-id, and passes the authoring rules loaded through `load-plain-reference`.
- [ ] `[record]` Every place where the specs deliberately differ from the code (intended behavior written instead of actual, code left out) was approved by the user.
- [ ] `[both]` Every resource adopted from an existing project was checked against the code; each divergence was answered by the user, and the corrections live in the unit's own copies, not in the adopted files.
- [ ] `[disk]` When a copied lint or build configuration loads rules from outside `plain/`, the effective rules are written as requirements.
- [ ] `[both]` `functionalities` names source files for every func-id, and every file in the unit is the source of at least one func-id or is recorded as wiring only.
- [ ] `[disk]` When conformance tests are on: every functionality has a test plain file, and the test scripts stage the rendered unit into the host.

## Ready to record

- [ ] `[disk]` The unit's `render_map` matches the paths the test scripts copy the rendered unit to.
- [ ] `[record]` The full verdict line of `plain-healthcheck` — not only its config and parser checks — is `PASS` after the last change to a `.plain` file; only failures recorded as pre-existing in Step 0 are excepted.
- [ ] `[disk]` The staging scripts back up the host's own files at the unit's paths, restore them on exit, and check that the process running the tests sees the staged files.
