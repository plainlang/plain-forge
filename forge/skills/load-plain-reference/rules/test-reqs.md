---
description: Rules for writing ***test reqs*** sections in .plain files
---

# Rules for writing `***test reqs***`

When writing or editing a `***test reqs***` section in a `.plain` file, always follow these rules:

## Conformance tests only
- Test reqs specify how **conformance tests** should be written and run
- Unit test guidance goes in `***implementation reqs***`, not here
- Acceptance tests are nested under individual functional specs, not here
- Behavioral requirements go in `***functional specs***`, not here

## `:ConformanceTests:` lives here (hard rule)
- **Everything** about `:ConformanceTests:` goes in `***test reqs***` — paths, approach, packages, framework, execution command, mocking / network policy, fixtures, pass criteria, environment prerequisites
- `:ConformanceTests:` live outside the generated codebase, in their own tree under `plain_modules/<module>/tests/` (one folder per functional spec), so requirements that shape them belong in test reqs by definition
- The conformance-test generator reads **only** `***test reqs***` — anything about `:ConformanceTests:` placed elsewhere (e.g. `***implementation reqs***`) is silently ignored
- Author each `:ConformanceTests:` requirement via `add-test-requirement` and phrase it in terms of `:ConformanceTests:` so the partition stays visible at a glance
- Conformance testing run scripts should be linked here as a linked resource

## What belongs here
- Test framework: which framework to use (e.g., pytest, Unittest, xUnit)
- Execution method: the command to run the tests
- Testing constraints: what must or must not be done in tests (e.g., no skipping, mock requirements)
- Test data: how test fixtures or mock data should be structured
- Environment setup: any prerequisites for running conformance tests

## Test type reference

| Test type | Where to specify | Generated | Purpose |
|-----------|-----------------|-----------|---------|
| Unit tests | `***implementation reqs***` | Automatically | Test individual functionalities in isolation |
| Conformance tests | `***test reqs***` | Automatically | Verify each functionality's implementation against its functional spec |
| Acceptance tests | `***acceptance tests***` under a functional spec | Manually | Verify implementation of a functional spec through a specific end-to-end scenario |

## No duplication
- Do not duplicate guidance already present in the file or its imports
- Check imported modules before adding a new test req

## Concept references
- Reference predefined concepts like `:ConformanceTests:` where appropriate
- All other referenced `:Concepts:` must be defined in `***definitions***`

## Conciseness
- State each req in the fewest plain words that stay exact — see `concise-specs.md`
- Do not restate the default behavior of the test framework this section already names

## Format

```plain
***test reqs***
- :ConformanceTests: should be implemented using pytest framework.
- :ConformanceTests: will be run using "pytest" command.
- :ConformanceTests: must be implemented and executed - do not skip tests.
- :ConformanceTests: should mock all external HTTP calls.
- :ConformanceTests: are prepared via the prepare script [test_scripts/prepare_environment_python.sh](test_scripts/prepare_environment_python.sh).
- :ConformanceTests: are executed via the run script [test_scripts/run_conformance_tests_python.sh](test_scripts/run_conformance_tests_python.sh).
```
