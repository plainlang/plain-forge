---
name: add-functional-spec
description: >-
  Add a single functional spec to the ***functional specs*** section of a
  ***plain spec file. Use whenever exactly one new functional spec is being
  added — whether the user explicitly asks, or another skill/workflow
  (e.g. forge-plain, add-feature) needs to author a new functional spec.
  Every new entry under ***functional specs*** must go through either this
  skill or `add-functional-specs` (the bulk variant for adding multiple specs
  in one pass); hand-authoring functional specs without invoking one of these
  skills is forbidden.
---

# Add Functional Spec

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## Workflow

1. **Identify the target `.plain` file.** If ambiguous, ask the user.
2. **Read the entire file** to understand existing definitions, implementation reqs, and all current functional specs (including those in `requires` modules).
3. **Pick the func-id and draft the functional spec.** Choose a func-id per `semantic-ids.md` and confirm no `# <func-id>` heading with that id exists in the module. Draft the body, a statement line and any detail under it, following the rules below, then run the review pass in `concise-specs.md` over the draft — trim it to the shortest wording that keeps every fact before any other check.
4. **Analyze complexity** — use the `analyze-if-func-spec-too-complex` skill to verify the drafted spec implies ≤ 200 LOC. If too complex, use the `break-down-func-spec` skill to split it, then repeat from step 3 for each resulting spec.
5. **Check for conflicts** with every existing functional spec — this is critical. Run `analyze-func-specs` **once** with the new spec plus all existing specs (in the file and in any `requires` chain) as a single batch. The batched analyzer returns every conflicting pair in one call — do **not** invoke a pair-by-pair analyzer. For each conflicting pair it reports, run `resolve-spec-conflict` on that pair; re-run `analyze-func-specs` over the touched set after each resolution until the verdict is `COMPATIBLE`.
6. **Append the spec** to the end of the `***functional specs***` section as a `# <func-id>` heading followed by its body, one blank line after the previous functionality (specs are chronological; new ones go last).
7. **Read the file again** to confirm correct placement and syntax.
8. **Write the test plain file.** When conformance tests are enabled for the module, invoke `add-test-scenarios` for the new functionality (see *Test Scenarios* below).

## Rules

### Complexity Limit

Each functional spec must imply a **maximum of 200 changed lines of code**. If the requirement is too large, use the `break-down-func-spec` skill to split it into multiple smaller, independent specs. Do not include LOC estimates in the spec text.

### Chronological Ordering

Specs are rendered incrementally, top to bottom. The renderer has **no knowledge of future specs** — only previously rendered specs are in context. This means:
- A new spec can reference behavior defined by earlier specs.
- A new spec **cannot** assume anything about specs that come after it.
- Place the new spec at the correct position if it must come before a future spec; otherwise append at the end.

### Language Agnosticism

Write in terms of behavior, concepts, and domain logic — not implementation constructs. Avoid language-specific types, generics syntax, framework annotations, or other constructs tied to a particular language or framework. General technical terms (null values, JSON types, HTTP status codes) are fine. Language-specific guidance belongs in `***implementation reqs***`.

### No Conflicts

The new spec must not contradict any existing functional spec. Conflicting specs are the most costly outcome. Before adding, review all existing specs and verify the new one is compatible. Use `analyze-func-specs` to check the new spec against every existing spec in **one batched call** — it lists every conflicting pair, so a pair-by-pair analyzer is not needed. If ambiguity exists, add explicit detail to eliminate any conflicting interpretation. For each conflicting pair the batched analyzer reports, use the `resolve-spec-conflict` skill to diagnose and fix it before proceeding.

### Disambiguation

Each functional spec must be unambiguous — the renderer should have only one reasonable interpretation. If the statement line is not enough to fully disambiguate the behavior, add `- ` bullets or sentences under it. The detail clarifies the statement; it does not introduce separate functionality. Even with the detail, the spec must still imply ≤ 200 LOC.

```plain
***functional specs***

# send-message
A :User: can send a :Message: to a :Conversation:.
- A :Message: must have non-empty content.
- The :Message: is appended to the end of the :Conversation:.
- All :Participant: members of the :Conversation: can see the new :Message:.
```


### Deterministic Interface

Specs must be detailed enough that a developer can use the built software without reading the generated code. All external interfaces must be explicit — REST endpoint paths and HTTP methods, CLI command names and arguments, file formats, message schemas, etc. Never leave interface details up to the renderer's discretion.

### Encapsulation

Functionality must be self-contained in the spec text. `requires` modules only import functional specs, so do not rely on implementation reqs to convey behavior — they won't be visible in downstream modules.

## Test Scenarios

After inserting the spec, invoke `add-test-scenarios` for it. It writes the functionality's test plain file (by convention `tests/<module>/<func-id>.plain`), which should hold at least one conformance scenario when conformance tests are enabled for the module.

## Validation Checklist

- [ ] Spec implies ≤ 200 lines of code changes
- [ ] No conflict with any existing functional spec
- [ ] Written in language-agnostic terms (no language/framework specifics)
- [ ] All external interfaces are explicit (endpoint paths, methods, CLI args, formats, etc.)
- [ ] All referenced `:Concepts:` are defined in `***definitions***`
- [ ] Sentences are short, clear, and unambiguous
- [ ] Trimmed per `concise-specs.md`: nothing obvious, no rationale, no uncheckable adjectives or hedges, plain words throughout
- [ ] No redundancy with existing specs
- [ ] Placed in correct chronological position (usually at the end)
- [ ] The func-id follows `semantic-ids.md` and is unique in the module
- [ ] `add-test-scenarios` was invoked for the new functionality when conformance tests are enabled
