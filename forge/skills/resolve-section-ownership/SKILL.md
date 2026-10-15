---
name: resolve-section-ownership
description: >-
  Route every fact in a .plain bullet, section, or file to the section that owns it — splitting a bullet that carries several kinds of fact, and moving a misplaced one to where the renderer will read it. Use when a bullet answers more than one of what it is / what it does / how it is built / how it is tested, when a requirement looks like it is in the wrong section, or when auditing a file for section ownership. Not for a spec that is merely too large (use break-down-func-spec) or for two specs that contradict each other (use resolve-spec-conflict).
---

# Resolve Section Ownership

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

This is the ownership counterpart to `break-down-func-spec`. That skill splits one functional spec into several because it is **too large**; this one moves facts between sections because they are in the **wrong place**. The two are unrelated: a correctly placed spec can be too large, and a one-line bullet can be misplaced.

## When to Use

- A bullet answers more than one of *what is it*, *what does it do*, *how is it built*, *how is it tested*.
- A requirement states a mechanism (retry, cache, token refresh, connection handling) but sits in `***functional specs***`.
- A `:UnitTests:` fact sits in `***test reqs***`, or a `:ConformanceTests:` fact sits in `***implementation reqs***` — the generators read only their own section, so the fact is silently ignored today.
- A functional spec describes an external system rather than the software being built.
- A whole file is being audited for placement.

## When Not to Use

- The spec is correctly placed but too large → `analyze-if-func-spec-too-complex`, then `break-down-func-spec`.
- Two specs contradict each other → `analyze-func-specs`, then `resolve-spec-conflict`.
- The wording is merely verbose → trim per `concise-specs.md`; no fact changes section.

## Input

The bullet, section, or `.plain` file to resolve.

## Workflow

1. **Read the full `.plain` file** — every section, plus its `imports` and `base` chains, so an existing home for a fact is visible before a new one is written.
2. **Identify the target** — one bullet, one section, or the whole file.
3. **Decompose each bullet into atomic facts.** A clause joined by *and*, *which*, *so that*, or a comma often carries a second fact. Keep each fact in the author's own words for now; rewording comes at step 6.
4. **Route each fact** by the *Section ownership* table in `module-structure.md`. Where a fact resists the table, apply the question it encodes: **would a caller of the finished software observe this?** Yes → `***functional specs***`. No, it is how the result is reached → `***implementation reqs***`. It says what a term means → `***definitions***`. It shapes `:ConformanceTests:` → `***test reqs***`.
5. **Split a fact that carries both a mechanism and its consequence.** The consequence is observable and becomes the functional spec; the mechanism becomes the implementation req. *"Sends the same idempotency key on every retry, so a retried write creates at most one record"* is two facts, not one.
6. **Give each moved fact a subject that exists in the built system.** A fact leaving a functional spec often loses its subject: name the component that owns the behavior, and add it to `***definitions***` if it is not defined yet. `:Implementation:` is the whole codebase — use it only for a fact that holds everywhere.
7. **Author each fact into its owning section** with the right edit skill — `add-concept`, `add-implementation-requirement`, `add-test-requirement`, `add-acceptance-test`. **Never hand-author `***functional specs***`**: a fact moving *into* that section goes through `add-functional-spec`, which runs the complexity and conflict analyzers for you.
8. **Remove each fact from where it no longer belongs.** If a bullet is left stating nothing observable, delete the bullet; do not leave a stub. Deleting the last bullet of a section deletes the section.
9. **Verify nothing was lost and nothing was duplicated.** Walk every fact from the original text and confirm it appears in exactly one section. A fact that now reads as obvious in its new home is still a cut decision — make it deliberately, per `concise-specs.md`.
10. **Run `plain-healthcheck`.** Moving facts changes the renderable surface; do not finish on a `FAIL`.
11. **Read the file again** to confirm canonical section order (`***definitions***` → `***implementation reqs***` → `***test reqs***` → `***functional specs***`), correct syntax, and that every referenced concept is still defined before use.

## Error Handling

- **`add-functional-spec` reports the moved fact is too complex** → the fact was a whole spec in disguise; run `break-down-func-spec` on it, then place the resulting specs.
- **`add-functional-spec` reports a conflict** → resolve it with `resolve-spec-conflict` **before** removing the fact from its old section, so no version of it is lost in between.
- **A fact appears to belong to two sections** → it is two facts; split it per step 5. If it still resists, it is a mechanism whose consequence has not been written down — write the consequence, and the split follows.
- **The owning section does not exist in the file** → create it in canonical order. An import module carries no `***functional specs***` at all (see `import-modules.md`), so an observable fact found there belongs on the root module that imports it.
- **The move empties a functional spec** → delete the spec rather than leaving a placeholder, and check whether any acceptance test nested under it must move or go with it.

## Worked examples

`concise-specs-examples.md` (*Split one crowded bullet across its owning sections*) shows one bullet carrying four kinds of fact. `concise-specs-integration-examples.md` works through the mechanism-versus-result cases — retry policy, idempotency, auth — which are where this comes up most.

## Validation Checklist

- [ ] Every fact from the original text appears in exactly one section, or was deliberately cut
- [ ] No fact was reworded into a different meaning while being moved
- [ ] Each moved fact names a subject that exists in the built system
- [ ] Every fact moved into `***functional specs***` went through `add-functional-spec`
- [ ] No `:UnitTests:` fact outside `***implementation reqs***`, no `:ConformanceTests:` fact outside `***test reqs***`
- [ ] Sections are in canonical order and every referenced concept is defined before use
- [ ] Emptied bullets and sections were removed, not left as stubs
