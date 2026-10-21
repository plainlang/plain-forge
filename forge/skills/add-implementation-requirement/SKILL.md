---
name: add-implementation-requirement
description: >-
  Add an implementation requirement to the ***implementation reqs*** section of
  a ***plain spec file. Use when the user wants to add non-functional
  requirements like technology choices, architectural constraints, coding
  standards, data formats, error handling strategies, or any HOW-to-build
  guidance to a .plain file.
---

# Add Implementation Requirement

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.


## Workflow

1. **Identify the target `.plain` file.** If ambiguous, ask the user.
2. **Read the file** to understand existing implementation reqs, definitions, and functional specs.
3. **Determine if this belongs in implementation reqs** — it must describe HOW to build, not WHAT to build (that goes in `***functional specs***`).
4. **Draft the requirement** following the rules below.
5. **Insert it** into the `***implementation reqs***` section.
6. **Read the file again** to confirm correct placement and syntax.

## What Belongs Here

Implementation reqs are free-form instructions that steer code generation. Common contents:

- **Technology choices**: language, framework, runtime version
- **Architectural constraints**: patterns, layering, dependency rules
- **Coding standards**: naming conventions, style guidelines
- **Data formats**: serialization, encoding, transformation rules
- **Error handling**: strategies, retry logic, exception hierarchies
- **Algorithm descriptions**: specific approaches when behavior alone is insufficient
- **Performance guidance**: memory constraints, streaming requirements, batching strategies
- **Language-specific constructs**: generics, annotations, framework-specific types and idioms

## What Does NOT Belong Here

- **Behavior and features** — those go in `***functional specs***`
- **Concept definitions** — those go in `***definitions***`
- **Conformance-test instructions** — those go in `***test reqs***`. Note: **unit-test instructions belong HERE**, not in `***test reqs***` — see *Unit-test guidance belongs here* below

## Unit-test guidance belongs here

**Everything about `:UnitTests:` goes in `***implementation reqs***`** — paths, approach, packages, framework (JUnit / pytest / Jest / Go's `testing` / …), conventions, fixtures, mocking policy, file layout, naming, lint / static-analysis gates. Unit tests are part of the generated codebase, so requirements that shape them are implementation reqs by definition.

- The unit-test generator reads **only** `***implementation reqs***`; anything about `:UnitTests:` placed in `***test reqs***` is silently ignored
- Phrase each `:UnitTests:` requirement in terms of the predefined `:UnitTests:` concept so the partition stays visible at a glance
- `***test reqs***` is exclusively for `:ConformanceTests:` — see [`add-test-requirement`](../add-test-requirement/SKILL.md)

## Key Principle: HOW vs WHAT

`***implementation reqs***` describe HOW the software should be built.
`***functional specs***` describe WHAT the software should do.

If the requirement describes observable behavior (endpoints, business rules, user-facing features), it belongs in functional specs. If it describes internal structure, technology, or coding guidance, it belongs here.

## Format

Implementation reqs are bullet points in the `***implementation reqs***` section:

```plain
***implementation reqs***

- :Implementation: should be in Python 3.12.

- :Implementation: should use pip for dependency management.

- :ReportExporter: writes a :CsvFile: with streaming writes, never holding the full dataset in memory.

```

Reference defined `:Concepts:` where they add clarity. Implementation reqs in non-leaf sections apply to all subsections.


## Encapsulation Warning

`requires` modules only receive functional specs from their dependencies — not implementation reqs. If downstream modules need certain behavior to be visible, that behavior must be expressed in functional specs, not here.

## Validation Checklist

- [ ] Describes HOW to build, not WHAT to build
- [ ] All referenced `:Concepts:` are defined in `***definitions***`
- [ ] Does not duplicate guidance already present in the file or its imports
- [ ] Trimmed per `concise-specs.md`: plain words, no rationale, no standard behavior of a technology already named
- [ ] Placed inside a `***implementation reqs***` section
- [ ] No behavioral requirements that should be in `***functional specs***`
