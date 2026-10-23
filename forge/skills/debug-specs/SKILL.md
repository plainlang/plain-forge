---
name: debug-specs
description: >-
  Investigate a bug observed in the running application by reading the generated
  code in plain_modules/, tracing the issue back to the specs, and fixing only
  the .plain files. Generated code is never modified. Use when the user reports
  unexpected behavior, visual glitches, crashes, or incorrect logic in the app.
---

# Debug Specs

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## When to Use

- The user observes a bug in the running application (visual, behavioral, crash, performance).
- A conformance test or unit test is failing.
- The generated code does something unexpected or incorrect.
- The user points to a specific functional spec that seems wrong.

## Guiding Principle

Generated code in `plain_modules/<module>/code/` and `plain_modules/<module>/tests/` is **read-only** — it exists solely as evidence for diagnosis. All fixes are applied exclusively to the `.plain` spec files. The workflow is: observe → read generated code → trace to spec → fix the spec.

## Input

1. **The module name** — identifies the `plain_modules/<module_name>/` directory (`code/` and `tests/`) and the corresponding `.plain` file(s).
2. **The user's observation** — what is wrong? This can be a bug description, a screenshot, a test failure, an error message, or a general "this doesn't work right."
3. **Optional: a specific functional spec** — if the user suspects a particular spec, start there. Otherwise, investigate broadly.

## Phase 1 — Understand the Context

1. **Read the `.plain` file(s)** for the module — frontmatter, definitions, implementation reqs, test reqs, and all functional specs. Also read `import` and `requires` chains, and the module's test plain files.
2. **Read the user's observation carefully.** Rephrase it back to confirm understanding. Identify:
   - What is the expected behavior?
   - What is the actual behavior?
   - Is this a visual issue, a logic issue, a crash, or a data issue?

## Phase 2 — Investigate the Generated Code

Read files in `plain_modules/<module_name>/code/` to understand what the renderer produced. **Do not modify any generated files.**

### 2a. Narrow the search

If the user pointed to a specific spec or area:
- Identify which generated files implement that spec's behavior.
- Read those files to understand the current implementation.

If the investigation is broad:
- Start from the entry point and follow the execution path related to the observed bug.
- Use the observation to narrow down: UI issue → look at widgets/views, logic issue → look at business logic/providers, data issue → look at models/repositories.

### 2b. Read the relevant generated code

For each relevant file:
1. Read the code and understand what it does.
2. Compare the behavior to what the spec says it should do.
3. Note any discrepancies — places where the code doesn't match the spec's intent.

### 2c. Check conformance tests and unit tests (if relevant)

If the bug manifests as a test failure:
1. Read the failing test — conformance tests in `plain_modules/<module_name>/tests/<func-id>/`, each labelled with the scenario-id it implements, unit tests inside `plain_modules/<module_name>/code/`.
2. Understand what the test expects vs. what the implementation does.
3. Determine whether the test expectation is correct (matches the spec) or incorrect (doesn't match the spec).

## Phase 3 — Diagnose the Root Cause

Trace the issue from the generated code back to the specs. There are six possible root causes — determine which one applies **before** making changes:

| Root Cause | Symptom | Fix |
|------------|---------|-----|
| **Ambiguous spec** | The spec is correct in intent, but vague enough that the renderer interpreted it differently than intended. | Add explicit detail to the spec to eliminate the ambiguity. |
| **Missing spec** | The desired behavior is not covered by any spec. The renderer had no guidance and either did nothing or made an arbitrary choice. | Add a new functional spec using the `add-functional-spec` skill. |
| **Conflicting specs** | Two specs contradict each other, causing the renderer to produce inconsistent behavior. | Use the `resolve-spec-conflict` skill. |
| **Incorrect spec** | The spec explicitly describes the wrong behavior. The renderer implemented it faithfully, but the spec itself is wrong. | Rewrite the spec to describe the correct behavior. |
| **Incorrect scenario** | The spec is correct and the code matches it, but a scenario in the test plain file expects an outcome the spec does not state, or misses one it states. | Fix the scenario with `add-test-scenarios`. |
| **Missing implementation req** | The spec is correct, but the implementation req doesn't provide enough guidance for the renderer to produce the right code (e.g., missing library, missing architectural constraint, missing platform detail). | Add or update the implementation req using the `add-implementation-requirement` skill. |

### How to diagnose

1. **Read the spec that governs the buggy behavior.** Does it clearly and unambiguously describe the correct behavior?
   - If the spec is clear and correct but the code is wrong → **ambiguous spec** (the renderer misinterpreted it) or **missing implementation req**.
   - If the spec doesn't mention the behavior at all → **missing spec**.
   - If the spec explicitly describes the wrong behavior → **incorrect spec**.
2. **Check for conflicts.** Could another spec be overriding or contradicting this behavior?
   - Read all functional specs that touch the same concepts.
   - If two specs are in tension → **conflicting specs**.
3. **Check the scenario.** When a conformance or acceptance test fails, find its scenario by the scenario-id in the test name and compare it with the spec.
   - If the scenario contradicts or extends the spec → **incorrect scenario**.
4. **Check implementation reqs.** Is the renderer missing guidance on how to implement correctly?
   - Does the implementation req specify the right library, pattern, or constraint?
   - If a platform-specific or framework-specific detail is missing → **missing implementation req**.

## Phase 4 — Fix the Specs

Apply the fix based on the diagnosed root cause. Use the appropriate skill:

| Root Cause | Skill to Use |
|------------|-------------|
| Ambiguous spec | Edit the spec inline — add detail under the statement line or reword for clarity |
| Missing spec | `add-functional-spec` |
| Conflicting specs | `resolve-spec-conflict` |
| Incorrect spec | Edit the spec inline — rewrite the incorrect part |
| Incorrect scenario | `add-test-scenarios` |
| Missing implementation req | `add-implementation-requirement` |

### Fix guidelines

- **Minimal changes.** Only modify what is necessary to fix the observed bug. Avoid rewriting unrelated specs.
- **Preserve chronological order.** If adding a new spec, place it correctly relative to existing specs.
- **Stay language-agnostic.** Functional specs describe behavior, not implementation. Platform-specific guidance belongs in implementation reqs.
- **Respect the 200 LOC limit.** If a fix makes a spec too complex, use `break-down-func-spec` to split it.
- **Keep the test plain file in step.** After changing a functional spec, invoke `add-test-scenarios` for it so its scenarios still follow from the spec.
- **Check for new conflicts.** After editing, verify the fix doesn't conflict with other specs by running `analyze-func-specs` once with the edited spec(s) plus every existing spec that touches the same concepts. The batched analyzer reports all conflicting pairs in a single call; resolve each with `resolve-spec-conflict`.

## Phase 5 — Verify and Report

1. **Re-read the modified `.plain` file(s)** in full to confirm correctness.
2. **Summarize the findings** for the user:
   - What was observed (the bug)
   - What the generated code was doing (the symptom in code)
   - Which spec(s) caused the issue (the root cause)
   - What was changed in the specs (the fix)
   - What to expect after re-rendering
3. **If uncertain**, present the diagnosis and proposed fix to the user for confirmation before making changes. Some bugs have multiple possible causes — when in doubt, explain the options and let the user decide.

## Debugging Strategies

### Strategy 1: Observation-Driven (most common)

Start from the user's observation and work backward through the code to the spec.

```
User sees bug → Read generated code → Find the responsible code path →
Identify which spec governs that code → Diagnose why the spec produced wrong code →
Fix the spec
```

### Strategy 2: Spec-Focused

The user suspects a specific spec. Compare the spec directly against the generated code.

```
User points to spec → Read the spec → Find the generated code that implements it →
Compare spec intent vs. code behavior → Diagnose the gap → Fix the spec
```

### Strategy 3: Test-Failure-Driven

A test is failing. Use the test as the entry point.

```
Read failing test → Understand what it expects → Read the implementation →
Determine if the test or the implementation is wrong → Trace back to the spec →
Fix the spec (or the test reqs / the scenario in the test plain file if the test itself is wrong)
```

### Strategy 4: Differential

The bug appeared after a new spec was added. Compare before and after.

```
Identify the newly added spec → Read the specs it might conflict with →
Check if the new spec introduced the bug → Use resolve-spec-conflict or
revise the new spec
```

## Common Pitfalls

### Fixing the code instead of the spec
Never modify files in `plain_modules/<module>/code/` or `plain_modules/<module>/tests/`. Even if the fix is obvious in the code, the change must be made in the `.plain` file so it persists across re-renders.

### Treating symptoms instead of root causes
If the user says "the button is in the wrong place," don't just add positioning detail. Investigate why the renderer placed it there — the root cause might be a missing layout spec, an ambiguous screen description, or a conflict with another spec.

### Over-specifying the fix
Adding too much implementation detail to a functional spec (e.g., specific pixel values, widget names, CSS properties) makes it brittle. Prefer behavior-level fixes. Use implementation reqs for platform-specific guidance.

### Ignoring ripple effects
A spec fix may affect other specs that reference the same concepts. Always check neighboring specs for conflicts after making a change.

## Validation Checklist

- [ ] User's observation is clearly understood (expected vs. actual behavior)
- [ ] Generated code has been read to understand the current implementation
- [ ] Root cause is diagnosed (ambiguous / missing / conflicting / incorrect / incorrect scenario / missing impl req)
- [ ] Fix is applied in the `.plain` file(s) only — no generated code modified
- [ ] Fix is minimal and targeted to the observed bug
- [ ] Fix does not introduce new conflicts with existing specs
- [ ] Modified specs respect the 200 LOC limit
- [ ] Modified specs remain language-agnostic
- [ ] Chronological ordering is preserved
- [ ] Test plain file of every changed functionality brought in step via `add-test-scenarios`
- [ ] Summary of findings and fix presented to the user
