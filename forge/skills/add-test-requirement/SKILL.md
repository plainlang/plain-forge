---
name: add-test-requirement
description: >-
  Add a test requirement to the ***test reqs*** section of a ***plain spec
  file. Use when the user wants to specify conformance testing instructions
  like test frameworks, execution methods, or testing constraints in a .plain
  file.
---

# Add Test Requirement

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.


## Workflow

1. **Identify the target `.plain` file.** If ambiguous, ask the user.
2. **Read the file** to understand existing test reqs and the overall spec structure.
3. **Confirm this is a conformance test concern** — unit test guidance goes in `***implementation reqs***`, not here.
4. **Draft the requirement** following the rules below.
5. **Insert it** into the `***test reqs***` section.
6. **Read the file again** to confirm correct placement and syntax.

## What Belongs Here

Test reqs specify how **conformance tests** should be written and run. Common contents:

- **Test framework**: which framework to use (e.g., pytest, Unittest, xUnit)
- **Execution method**: the command to run the tests
- **Testing constraints**: what must or must not be done in tests (e.g., no skipping tests, mock requirements)
- **Test data**: how test fixtures or mock data should be structured
- **Environment setup**: any prerequisites for running conformance tests

## What Does NOT Belong Here

- **Unit test guidance** — that goes in `***implementation reqs***`
- **Test scenarios** — conformance and acceptance scenarios live in test plain files, written with `add-test-scenarios` (see `test-plain-files.md`)
- **Behavioral requirements** — those go in `***functional specs***`
- **Technology choices for the implementation** — those go in `***implementation reqs***`

## Conformance Tests vs Other Tests

| Test Type | Where to Specify | Purpose |
|-----------|-----------------|---------|
| Unit tests | `***implementation reqs***` | Test individual functionalities in isolation |
| Conformance tests | how: `***test reqs***`; what: `***conformance tests***` of the test plain file | Verify the expected use of one functionality, its main path |
| Acceptance tests | how: `***test reqs***`; what: `***acceptance tests***` of the test plain file | Verify one functionality under use that is not expected: invalid parameters, wrong or missing authentication, missing data |

## Format

Test reqs are bullet points in the `***test reqs***` section:

```plain
***test reqs***

- :ConformanceTests: should be implemented using pytest framework.

- :ConformanceTests: will be run using "pytest" command.

- :ConformanceTests: must be implemented and executed - do not skip tests.

- :ConformanceTests: should mock all external HTTP calls.
```

Reference predefined concepts like `:ConformanceTests:` and any defined `:Concepts:` where they add clarity.


## Validation Checklist

- [ ] Describes conformance testing concerns, not unit tests or behavior
- [ ] All referenced `:Concepts:` are defined (or are predefined like `:ConformanceTests:`)
- [ ] Does not duplicate guidance already present in the file or its imports
- [ ] Trimmed per `concise-specs.md`: plain words, no rationale, no default framework behavior
- [ ] Placed inside a `***test reqs***` section
- [ ] No behavioral requirements that should be in `***functional specs***`
