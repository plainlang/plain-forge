# Add Feature Workflow Checklist

Use this to verify the workflow was followed — never as a substitute for it. Run the loop block on each iteration, and run the whole list once more during Phase 3 before declaring the feature done. A box only counts as met when the spec is on disk and explicitly approved, not merely discussed. If a box is unmet, go back and complete the step.

## Phase 0 — Feature intent

- [ ] Invoked `load-plain-reference` first (unless already loaded this session).
- [ ] Read `references/phase-0-intent.md` and asked its five core questions one at a time.
- [ ] Asked no more than one focused clarification for an answer too vague to summarize.
- [ ] Wrote no project or specification files during Phase 0.
- [ ] Kept concepts, spec wording, implementation technology, and tests for later phases.
- [ ] Summarized motivation, affected user, desired outcome, observable success criterion, and
  boundary with explicit exclusions; got explicit confirmation.

## Phase 1 — Scope

- [ ] Carried the confirmed feature-intent brief into scope and identified the likely target
  `.plain` file(s) without restarting intent discovery.
- [ ] Read the target `.plain` file(s) and followed their `import`/`requires` chain before authoring.
- [ ] Picked the target module with a question only when genuinely ambiguous — otherwise started authoring immediately (no framing/scope/multi-part design questions here).

## Every loop iteration (Phase 2)

- [ ] Asked exactly one focused question via `AskUserQuestion` — not two bundled together — targeting one writable snippet (behavior, one concept/attribute, one edge case, one constraint, implementation guidance, or verification).
- [ ] Wrote the snippet to disk immediately after the answer via the dedicated edit skill — never hand-authored a `***plain` section.
- [ ] Every functional spec was authored via `add-functional-spec` (never hand-written); if it reported "too complex", split it via a follow-up question rather than alone.
- [ ] New concepts defined before they are referenced, with no circular references.
- [ ] Any answer that contradicted an earlier snippet was fixed in place before the next question — no stale intent left on disk.
- [ ] Every conflict / break / augment surfaced by the analyzers was put to the user as the *next* question (keep / augment / replace) and resolved before continuing.
- [ ] `***test reqs***` / `***acceptance tests***` authored only when the Conformance gate holds (a `config.yaml` with a valid `conformance-tests-script` pointing at an existing script).
- [ ] Asked the user whether the feature is fully covered before leaving the loop.

## Phase 3 — Final review

- [ ] Read the modified `.plain` file(s) in full.
- [ ] Verified: concepts defined before use, no cycles, chronological ordering correct end-to-end, functional specs language-agnostic, every external interface explicit (endpoints, methods, CLI args, formats), acceptance tests consistent with their parent specs.
- [ ] Presented the final diff and got the user's approval (change requests dropped back into the one-question loop, not a restart).
- [ ] Ran `plain-healthcheck`; worked its numbered list to `PASS` (fixing only `.plain`/`config.yaml`/scripts — never generated code) before declaring the feature ready and reminding the user to re-render `<module>.plain`.
