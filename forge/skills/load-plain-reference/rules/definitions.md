---
description: Rules for writing ***definitions*** sections in .plain files
---

# Rules for writing `***definitions***`

When writing or editing a `***definitions***` section in a `.plain` file, always follow these rules:

## Concept syntax
- Wrap concept names in colons: `:ConceptName:`
- Use CamelCase starting with an uppercase letter
- Valid characters: letters, digits, `+`, `-`, `.`, `_`

## Uniqueness
- Concept names must be globally unique across the spec and all its imports
- Check for collisions with concepts coming from `import` and `requires` modules before adding

## Predefined concepts (do not redefine)
- ***plain ships several predefined concepts that are available in every module without being defined
- Never add a `***definitions***` entry for any of them — the renderer treats redefinitions as conflicts

| Predefined concept | Meaning |
|--------------------|---------|
| `:plainDefinitions:` | Content of the `***definitions***` section |
| `:plainImplementationReqs:` | Content of the `***implementation reqs***` section |
| `:plainFunctionality:` | Content of the `***functional specs***` section |
| `:plainTestReqs:` | Content of the `***test reqs***` section |
| `:Implementation:` | The system implementing `:plainFunctionality:` |
| `:plainImplementationCode:` | The generated implementation code |
| `:UnitTests:` | Auto-generated unit tests for individual functionalities |
| `:ConformanceTests:` | Auto-generated tests verifying conformance to the spec |
| `:AcceptanceTest:` / `:AcceptanceTests:` | Tests validating specific aspects of the implementation |

## Conciseness
- A definition is one plain sentence plus, where needed, its attributes — see `concise-specs.md`
- Never restate the concept name as its own definition, and never explain why the concept exists

## Define before use
- A concept must be defined before it is referenced in any section (definitions, implementation reqs, functional specs, test reqs)
- Sources of definitions: the module's own `***definitions***`, an `import`ed module's definitions, or a `require`d module's `exported_concepts`

## No circular references
- Concept references must not form cycles — if A references B, then B must not reference A (directly or indirectly)
- Insert each concept after any concepts it references

Bad — circular:

```plain
***definitions***

- :Customer: is a user who has placed at least one :Order:.

- :Order: is placed by :Customer: and contains :OrderItem: entries.
```

`:Order:` references `:Customer:`, and `:Customer:` references `:Order:`. Fix by removing the back-reference:

```plain
***definitions***

- :Customer: is a user of the system.

- :Order: is placed by :Customer: and contains :OrderItem: entries.
```

## Exported concepts are not transitive
- If module A exports a concept and module B `requires` A, a module C with `requires: [B]` does **not** gain access to A's exports
- To use an ancestor's exports, list that ancestor in `requires` as well; concepts shared more broadly belong in a common import module

## Description quality
- Descriptions must be clear, concise, and language-agnostic
- Nest attributes and constraints as sub-bullets
- Do not use programming language constructs (generics, annotations, framework types) in definitions

## Concept granularity and technical components
- Definitions are not restricted to high-level domain objects. When an implementation warrants abstract, technical, or infrastructural components to clarify responsibilities, it is desired and encouraged to define them.
- Group related technical concepts using the `of` keyword or by stating their relationship explicitly.

Example of defining technical components alongside their behavior:

```plain
***definitions***

- :CsvToJsonConverter: bidirectionally converts csv and json strings.

- :CsvToJson: of :CsvToJsonConverter: converts a list of csv strings (e.g., "value1,value2,value3") to a list of json strings (e.g., "{\"key1\":\"value1\"}").

- :JsonToCsv: of :CsvToJsonConverter: converts a list of json strings (e.g., "{\"key1\":\"value1\"}") to a list of csv strings (e.g., "value1,value2").

- :StorageService: is an abstraction for a remote blob storage backend.

- :CsvFileWriter: writes CSV rows to local files, automatically rotates to new files when size limits are reached, and flushes completed files to :StorageService:.

- :CsvFileReader: reads CSV rows in a batched manner.

- :CsvJoiner: joins csvs and uses :CsvFileWriter: to create the merged CSV.
```

## Format

```plain
***definitions***

- :ConceptName: is a description of what it represents.
  - Attribute one (required)
  - Attribute two (optional)
```
