---
name: add-acceptance-test
description: >-
  Add acceptance tests under a functional spec in a ***plain spec file. Use
  when the user wants to add verification criteria for a specific functional
  spec, or after adding a functional spec that needs testable success criteria.
---

# Add Acceptance Test

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## Workflow

1. **Identify the target `.plain` file and the functional spec** to attach the acceptance test to. If ambiguous, ask the user.
2. **Read the file** to understand the functional spec, existing acceptance tests (if any), and the `***test reqs***` section (acceptance tests are implemented according to test reqs).
3. **Draft the acceptance test(s)** following the rules below.
4. **Nest them** under the target functional spec using a `***acceptance tests***` subsection.
5. **Read the file again** to confirm correct placement, indentation, and syntax.

## When to Add Acceptance Tests

- The functional spec's correct behavior is **non-obvious** or easily misinterpreted.
- The spec involves **edge cases**, boundary conditions, or specific numeric outcomes.
- The user explicitly requests verification criteria.
- The spec was added via the `add-functional-spec` skill and warrants testable success criteria.

## Format

Acceptance tests are nested under the functional spec they verify, using a `***acceptance tests***` subsection:

```plain
***functional specs***

- :Task: items are processed in batches of 100.

  ***acceptance tests***
  - Processing 250 :Task: items should result in 3 batches.

  - Each batch should contain at most 100 items.
```

Key formatting rules:
- The `***acceptance tests***` header is indented under the functional spec it belongs to.
- Each test bullet is indented under the `***acceptance tests***` header.
- Multiple acceptance tests can be listed under a single functional spec.


## Rules

### Conformance with the Functional Spec

An acceptance test is essentially an **example that illustrates** the functional spec — it clarifies intent by showing a concrete scenario. It may imply minor code changes, but those should not be substantial. The acceptance test **must be consistent with** the functional spec it is nested under. If the acceptance test asserts behavior that contradicts, narrows, or extends the functional spec in ways not implied by it, the system will reject it as a conflicting acceptance test. Before writing, re-read the parent functional spec and ensure every assertion in the acceptance test is a direct, logical consequence of what the spec states.

```
Functional spec:
- :Resource: items are returned sorted by creation date in descending order.

Good (consistent):
- The first :Resource: in the response should have the most recent creation date.

Bad (contradicts the spec — the spec says descending, not ascending):
- The first :Resource: in the response should have the oldest creation date.

Bad (extends beyond the spec — the spec says nothing about limiting results):
- The response should contain at most 50 :Resource: items.
```

### Scope

Each acceptance test verifies a specific, observable aspect of the functional spec it's nested under. Do not test behavior from other functional specs.

### Testability

Every acceptance test must describe a concrete, verifiable outcome — not a vague quality. The test should be implementable as an automated conformance test.

```
Good: - The response should contain exactly 3 items.
Bad:  - The response should be correct.
```

### Language Agnosticism

Like functional specs, acceptance tests must be written in terms of behavior and outcomes — not language-specific constructs.

### Relationship to Test Reqs

Acceptance tests extend conformance tests and are implemented according to the `***test reqs***` specification. They do not replace test reqs — they add spec-specific verification on top of the general testing framework defined there.

## Validation Checklist

- [ ] Every assertion is a direct logical consequence of the parent functional spec
- [ ] No assertion contradicts, narrows, or extends beyond the parent spec
- [ ] Acceptance test illustrates the spec via example, not introducing substantial new behavior
- [ ] Nested under the correct functional spec
- [ ] Indentation is correct (`***acceptance tests***` indented under the spec)
- [ ] Each test describes a concrete, verifiable outcome
- [ ] Trimmed per `concise-specs.md`: plain words, no obvious steps, no restatement of the parent spec
- [ ] Tests are scoped to the parent functional spec only
- [ ] Written in language-agnostic terms
- [ ] No duplication with existing acceptance tests on the same spec
