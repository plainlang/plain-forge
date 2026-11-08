# Capture review checklist

The Phase 4 review agent runs this list. Check each item by its tag: `[disk]` against the files, `[record]` against the evidence record in the spawn prompt, `[both]` by cross-checking the two and reporting any mismatch. Return `APPROVED`, or a numbered list of the unmet items with what is missing.

## Scan and choice

- [ ] `[record]` The intent was stated or confirmed before scanning.
- [ ] `[disk]` `scan.commit` in `plain/capture.json` is the commit the unit was captured from, and every candidate has paths, an interface with file and line, a boundary, tests, state, and fit.
- [ ] `[record]` The user chose the unit; every leak and any owned state was put to the user and answered.
- [ ] `[disk]` The unit's `paths`, `exclude`, and `boundary` in the manifest match the chosen candidate and the answers about leaks.

## Specs

- [ ] `[disk]` `template/host_context.plain` exists and transcribes the host stack and conventions; every host file the specs need is copied unchanged to `resources/host/<host path>` and linked there, and no link leaves `plain/`.
- [ ] `[disk]` The unit's interface is a concept that links the host files defining it; each host symbol is named by its fully qualified name and marked as imported from the host.
- [ ] `[both]` Every interface entry point from the scan is covered by at least one func-id.
- [ ] `[disk]` Every functional spec describes behavior observable through the interface, has a func-id, and passes the authoring rules loaded through `load-plain-reference`.
- [ ] `[record]` Every place where the specs deliberately differ from the code (intended behavior written instead of actual, code left out) was approved by the user.
- [ ] `[both]` `functionalities` names source files for every func-id, and every file in the unit is the source of at least one func-id or is recorded as wiring only.
- [ ] `[disk]` When conformance tests are on: every functionality has a test plain file, and the test scripts stage the rendered unit into the host.

## Ready to record

- [ ] `[disk]` The unit's `render_map` matches the paths the test scripts copy the rendered unit to.
- [ ] `[record]` `plain-healthcheck` returned `PASS` after the last change to a `.plain` file.
