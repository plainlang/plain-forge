---
description: Rules for writing ***implementation reqs*** sections in .plain files
---

# Rules for writing `***implementation reqs***`

When writing or editing an `***implementation reqs***` section in a `.plain` file, always follow these rules:

## HOW, not WHAT
- Implementation reqs describe **how** the software should be built, not **what** it should do
- Observable behavior (endpoints, business rules, user-facing features) belongs in `***functional specs***`
- Internal structure, technology choices, and coding guidance belong here

## `:UnitTests:` lives here (hard rule)
- **Everything** about `:UnitTests:` goes in `***implementation reqs***` — paths, approach, packages, framework, conventions, fixtures, mocking policy, file layout, naming, lint / static-analysis gates
- `:UnitTests:` are part of the generated codebase (they sit inside `plain_modules/<module>/code/` alongside the implementation), so requirements that shape them are implementation reqs by definition
- The unit-test generator reads **only** `***implementation reqs***` — anything about `:UnitTests:` placed elsewhere (e.g. `***test reqs***`) is silently ignored
- Author each `:UnitTests:` requirement via `add-implementation-requirement` and phrase it in terms of `:UnitTests:` so the partition stays visible at a glance

## What belongs here
- Technology choices: language, framework, runtime version
- Architectural constraints: patterns, layering, dependency rules
- Coding standards: naming conventions, style guidelines
- Data formats: serialization, encoding, transformation rules
- Error handling: strategies, retry logic, exception hierarchies
- Algorithm descriptions: specific approaches when behavior alone is insufficient
- Performance guidance: memory constraints, streaming requirements, batching strategies
- Language-specific constructs: generics, annotations, framework-specific types and idioms
- **Unit-test guidance: framework, structure, mocking conventions, file layout** — unit tests are part of the generated codebase, so requirements that shape them are implementation reqs

## What does NOT belong here
- Behavior and features → `***functional specs***`
- Concept definitions → `***definitions***`
- **Conformance-test guidance** → `***test reqs***`
- **Acceptance-test scenarios** → `***acceptance tests***` nested under the relevant functional spec

## Unit tests vs conformance tests (common mistake)
- Unit-test guidance (`:UnitTests:` framework, structure, mocking) goes **here**, not in `***test reqs***`
- `***test reqs***` is exclusively for `:ConformanceTests:` — framework, execution command, mocking policy, environment setup
- Putting unit-test guidance in `***test reqs***` is one of the most common authoring mistakes; the rendered code will silently miss those requirements because the unit-test generator only reads `***implementation reqs***`
- Unit testing run scripts should be linked here as a linked resource

## Encapsulation warning
- `requires` modules only pass on functional specs and `exported_concepts` — never implementation reqs
- If downstream modules need certain behavior to be visible, express it in functional specs, not here

## Conciseness
- State each req in the fewest plain words that stay exact — see `concise-specs.md`
- Do not restate the standard behavior of a technology this section already names

## No duplication
- Do not duplicate guidance already present in the file or its imports
- Check imported modules before adding a new req

## Concept references
- Reference defined `:Concepts:` where they add clarity
- All referenced concepts must already be defined in `***definitions***`
- Make the component a req constrains its subject; `:Implementation:` is the whole codebase, so use it only for a fact that holds everywhere — language, dependency manager, stack-wide convention

## Format

```plain
***implementation reqs***
- :Implementation: should be in Python 3.12.
- :Implementation: should use pip for dependency management.
- :ReportExporter: writes a :CsvFile: with streaming writes, never holding the full dataset in memory.
- :UnitTests: are executed via the run script [test_scripts/run_unittests_python.sh](test_scripts/run_unittests_python.sh).
```
