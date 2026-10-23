---
name: add-functional-specs
description: >-
  Add multiple functional specs to the ***functional specs*** section of a
  ***plain spec file in a single batch. Use whenever more than one new
  functional spec is being added — whether the user explicitly asks, or
  another skill/workflow (e.g. forge-plain, add-feature) needs to author
  several specs in one pass. Bulk-writing or hand-authoring functional
  specs without invoking this skill is forbidden; for adding a single spec,
  use add-functional-spec instead.
---

# Add Functional Specs

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## When to Use

- The user asks for several functional specs to be added in one go (e.g. "add these three specs", "spec out this feature in a few bullets").
- A higher-level skill or workflow (`forge-plain`, `add-feature`, `debug-specs`) needs to author a tight group of related specs.
- Anywhere you would otherwise be tempted to write more than one functional spec without running per-spec analysis.

If you only need to add a single spec, use the `add-functional-spec` skill instead. Either way, **never** edit the `***functional specs***` section by hand — every new entry must go through one of these two skills so the complexity and conflict checks actually run.

## Workflow

This skill is `add-functional-spec` applied **one spec at a time, in order**, with no shortcuts. The batch never escapes per-spec rigor.

1. **Identify the target `.plain` file.** If ambiguous, ask the user.
2. **Read the entire file** to understand existing definitions, implementation reqs, and all current functional specs (including those reachable via `import` / `requires`).
3. **Draft all the specs you intend to add**, in the chronological order they should appear, each with its own func-id per `semantic-ids.md`, unique in the module and within the batch. Keep the drafts in a working list — nothing is inserted yet. Run the review pass in `concise-specs.md` over every draft before continuing; trim each to the shortest wording that keeps every fact.
4. **For each drafted spec, in order:**
   1. **Analyze complexity.** Run `analyze-if-func-spec-too-complex` on the spec. If the verdict is `TOO COMPLEX`, run `break-down-func-spec`, replace the entry in the working list with the resulting smaller specs (preserving order), and restart this step on the first of the replacements.
   2. **Check for conflicts.** Run `analyze-func-specs` **once** with this single input set:
      - the new spec, plus
      - every existing functional spec in the file and its `requires` chain, plus
      - every spec from this batch that has already been inserted.

      The batched analyzer returns every conflicting pair in one call — do **not** loop over pairs invoking a per-pair analyzer. For each conflicting pair it reports, run `resolve-spec-conflict`. Apply the resolution — which may revise the new spec, an existing spec, or both — then re-run `analyze-func-specs` once over the touched set until the verdict is `COMPATIBLE`.
   3. **Append the spec** to the `***functional specs***` section as a `# <func-id>` heading followed by its body. Specs are chronological; the new entry goes at the end (unless an earlier existing spec must come *after* it — in that rare case, insert at the correct position).
5. **Read the file again** to confirm correct placement, ordering, and syntax for the full batch.
6. **Write the test plain files.** When conformance tests are enabled for the module, invoke `add-test-scenarios` once per inserted functionality, in order.

Order matters: each new spec is inserted only after its complexity and conflict checks pass, so subsequent specs in the batch are always checked against an already-validated file.

## Rules

All the rules from `add-functional-spec` apply per individual spec. They are restated here so this skill is self-contained.

### Complexity Limit (per spec)

Each functional spec must imply a **maximum of 200 changed lines of code**. If a spec is too large, use `break-down-func-spec` to split it into multiple smaller, independent specs. Do not include LOC estimates in the spec text.

### Chronological Ordering

Specs are rendered incrementally, top to bottom. The renderer has **no knowledge of future specs** — only previously rendered specs are in context.
- A new spec can reference behavior defined by earlier specs.
- A new spec **cannot** assume anything about specs that come after it.
- Order the batch so that each spec only depends on specs that precede it. If two new specs would otherwise reference each other, the dependent one comes second.

### Language Agnosticism

Write in terms of behavior, concepts, and domain logic — not implementation constructs. Avoid language-specific types, generics syntax, framework annotations, or other constructs tied to a particular language or framework. General technical terms (null values, JSON types, HTTP status codes) are fine. Language-specific guidance belongs in `***implementation reqs***`.

### No Conflicts (full coverage via one batched call per spec)

The new specs must not contradict each other **and** must not contradict any existing functional spec. Conflicting specs are the most costly outcome. The conflict check must cover:
- every (new × existing) pair, and
- every (new × new) pair within the batch.

That coverage is achieved by running `analyze-func-specs` **once per spec being inserted**, with the new spec plus every existing spec plus every already-inserted spec from this batch passed in as a single set. The batched analyzer lists every conflicting pair in one call — do not invoke a pair-by-pair analyzer. If ambiguity exists, add explicit detail to eliminate any conflicting interpretation. For each conflicting pair the batched analyzer reports, use the `resolve-spec-conflict` skill to diagnose and fix it before proceeding.

### Disambiguation (per spec)

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

After the batch has been inserted, invoke `add-test-scenarios` once per inserted functionality, in order. It writes each functionality's test plain file (by convention `tests/<module>/<func-id>.plain`) with at least one conformance scenario when conformance tests are enabled for the module. Do this per spec, not as part of the bulk pass.

## Anti-Patterns

- **Don't skip per-spec checks because the batch "feels" small.** Even two specs require two complexity checks and a batched conflict check that includes both new specs.
- **Don't fall back to pair-by-pair conflict analysis.** Use `analyze-func-specs` with the full relevant set once per inserted spec — not `analyze-2-func-specs` across every pair.
- **Don't run all complexity checks first and all conflict checks last.** Interleave them per spec, as described in the Workflow — a failed complexity check earlier would otherwise waste later conflict checks.
- **Don't insert every spec first and then analyze.** A bad spec already in the file pollutes subsequent conflict analyses.
- **Don't fall back to hand-authoring** because there are "a lot" of specs to add. The right answer is more analyzer calls, not fewer.
- **Don't use this skill for a single spec.** Use `add-functional-spec` — it's the same checks without the bulk bookkeeping.

## Validation Checklist

- [ ] Every spec in the batch implies ≤ 200 lines of code changes (verified via `analyze-if-func-spec-too-complex`)
- [ ] No conflict between any new spec and any existing spec (verified via batched `analyze-func-specs` calls)
- [ ] No conflict between any two new specs in the batch (covered by the same batched `analyze-func-specs` calls)
- [ ] Every conflicting pair the batched analyzer reported was resolved via `resolve-spec-conflict` before the batch completed
- [ ] All specs written in language-agnostic terms (no language/framework specifics)
- [ ] All external interfaces explicit (endpoint paths, methods, CLI args, formats, etc.)
- [ ] All referenced `:Concepts:` are defined in `***definitions***`
- [ ] Sentences are short, clear, and unambiguous
- [ ] Every spec trimmed per `concise-specs.md`: nothing obvious, no rationale, no uncheckable adjectives or hedges, plain words throughout
- [ ] No redundancy with existing specs or within the batch
- [ ] Specs placed in correct chronological positions
- [ ] Every func-id follows `semantic-ids.md` and is unique in the module and within the batch
- [ ] `add-test-scenarios` was invoked for every inserted functionality when conformance tests are enabled
