---
name: resolve-spec-conflict
description: >-
  Resolve a conflict between two functional specs in a ***plain spec file. Use
  when conformance tests for a previously passing spec start failing after a new
  spec is rendered, or when a potential conflict is detected while adding a new
  functional spec (via `add-functional-spec` or `add-functional-specs`).
---

# Resolve Spec Conflict

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

Before reading or editing any `.plain` file, check it for the old syntax (see *Old syntax* in `module-structure.md`): a flush-left `- ` bullet in `***functional specs***` or an `***acceptance tests***` section in a core spec. If either is present, stop, name the file and the marker, and point the user to `migrate-plain-syntax`; do not edit a file in the old syntax.

## When This Applies

A conflict exists (or is suspected) when:
- Conformance tests for a **previously passing** functional spec begin to fail after a new spec is rendered.
- A new spec being added (via the `add-functional-spec` or `add-functional-specs` skill) appears to contradict an existing spec.
- Two specs make incompatible assertions about the same behavior, data, or state.

## Workflow

### Step 1: Identify the Conflicting Pair

Read the `.plain` file and pinpoint the two specs in tension. If the conflict was detected via a conformance test failure, also read the failing test and the generated implementation in `plain_modules/` to understand what behavior changed.

### Step 2: Diagnose the Root Cause

There are three possible outcomes — determine which one applies **before** making changes:

| Outcome | Symptom | Fix |
|---------|---------|-----|
| **Implementation is incorrect** | Generated code doesn't match the spec's intent. The specs themselves are fine. | Clarify the ambiguous spec so the renderer interprets it correctly. Re-render. |
| **Conformance tests are incorrect** | The tests don't accurately verify the spec. The implementation is actually correct. | Adjust `***test reqs***`, or the scenarios in the test plain file via `add-test-scenarios`, to guide better test generation. Re-render. |
| **Requirements truly conflict** | The two specs are inherently contradictory — no implementation can satisfy both. | One or both specs must be revised. See Step 3. |

**How to diagnose:**
1. Read both functional specs carefully. Can a single implementation satisfy both simultaneously?
2. If yes → the specs are compatible; the issue is ambiguity (outcome 1) or bad tests (outcome 2).
3. If no → the requirements truly conflict (outcome 3).

### Step 3: Resolve the Conflict

When the requirements truly conflict, choose a resolution strategy:

**Strategy A: Add detail to disambiguate.** Often the specs aren't contradictory — they're just ambiguous enough that the renderer picks a conflicting interpretation. Adding explicit context to one or both specs eliminates the ambiguity.

Before (ambiguous):
```plain
***functional specs***

# list-resources
All :Resource: items are returned.

# list-active-resources
Only active :Resource: items are returned.
```

After (disambiguated):
```plain
***functional specs***

# list-resources
All :Resource: items are returned when no filter is specified.

# list-active-resources
When the "active" filter is specified, only active :Resource: items are returned.
```

**Strategy B: Revise the newer spec.** If the new spec introduced the conflict, rewrite it to be compatible with the established behavior from earlier specs.

**Strategy C: Revise the older spec.** If the older spec was under-specified and the new requirement reveals a better design, update the older spec. This is more disruptive — all conformance tests for that spec and everything after it may need re-rendering.

**Strategy D: Merge into one spec.** If the two specs describe overlapping behavior, combine them into a single, clear spec. Remove the redundant one and its test plain file, moving any still valid scenario into the kept functionality's file. Be mindful of the 200 LOC limit.

### Step 4: Validate the Resolution

After editing:
1. Re-read the full `***functional specs***` section to confirm no new conflicts were introduced.
2. Check that any revised spec still respects the 200 LOC limit.
3. Check that chronological ordering still makes sense (earlier specs should not depend on later ones).
4. If resolving via test adjustments, verify the `***test reqs***` or test plain file changes are appropriate.
5. For every revised functionality, invoke `add-test-scenarios` to bring its test plain file in step with the new text.

## Prevention (for use during add-functional-spec / add-functional-specs)

Before adding a new spec, run through this quick conflict check:

1. List every existing functional spec that touches the same `:Concepts:` as the new spec.
2. For each, ask: "Can a single implementation satisfy both this existing spec and the new one?"
3. If any answer is "not obviously yes" — add explicit detail to the new spec to eliminate the ambiguity **before** inserting it.

## Validation Checklist

- [ ] Root cause diagnosed (implementation / tests / true conflict)
- [ ] Resolution strategy chosen and applied
- [ ] Revised specs are language-agnostic
- [ ] Revised specs trimmed per `concise-specs.md` — added disambiguation stays as short as it can be
- [ ] Revised specs each imply ≤ 200 LOC
- [ ] No new conflicts introduced by the fix
- [ ] Chronological ordering preserved
- [ ] All referenced `:Concepts:` are still defined
- [ ] Test plain files of the revised functionalities brought in step via `add-test-scenarios`
