---
name: add-concept
description: >-
  Add a concept to the ***definitions*** section of a ***plain spec file. Use
  when the user wants to define a new concept, entity, or domain term in a
  .plain file.
---

# Add Concept

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

Before reading or editing any `.plain` file, check it for the old syntax (see *Old syntax* in `module-structure.md`): a flush-left `- ` bullet in `***functional specs***`, an `***acceptance tests***` section in a core spec, or `requires:` / `import:` in the frontmatter. If any is present, stop, name the file and the marker, and point the user to `migrate-plain-syntax`; do not edit a file in the old syntax.

## Workflow

1. **Identify the target `.plain` file.** If ambiguous, ask the user.
2. **Read the file** to understand existing definitions, imports, and concepts.
3. **Validate the concept name** against the syntax rules below.
4. **Check for uniqueness** — the concept name must not already exist in the file or its imports.
5. **Check referenced concepts** — any `:ConceptName:` used in the definition must already be defined above it (in this file or via `imports`/`base`). Concept references must not form cycles (e.g., A references B and B references A).
6. **Check for circular references** — if the new concept references `:B:`, then `:B:` must not reference the new concept (directly or indirectly). Example of a circular definition to avoid:
   ```plain
   - :Order: is placed by :Customer: and contains :OrderItem: entries.
   - :Customer: is a user who has placed at least one :Order:.
   ```
   Fix by removing the back-reference:
   ```plain
   - :Customer: is a user of the system.
   - :Order: is placed by :Customer: and contains :OrderItem: entries.
   ```
7. **Insert the concept** into the `***definitions***` section, after any concepts it references.
8. **Read the file again** to confirm correct placement and syntax.

## Concept Syntax Rules

- Wrapped in colons: `:ConceptName:`
- CamelCase, starting with an uppercase letter
- Valid characters: letters, digits, `+`, `-`, `.`, `_`
- Must be globally unique across the spec and all its imports
- Exported concepts from `base` modules are **not transitive** — to reference an ancestor's export, list that ancestor under `base`; if a concept is shared across branches, define it in a common import module instead

## Definition Format

A concept definition is a bullet in `***definitions***` that starts with the concept name:

```plain
***definitions***

- :ConceptName: is a description of what it represents.
```

Attributes and constraints are nested sub-bullets:

```plain
***definitions***

- :Task: describes an activity that needs to be done by :User:. :Task: has:
  - Name - a short description (required)
  - Notes - additional details (optional)
  - Due Date - completion deadline (optional)
```


## Validation Checklist

- [ ] Name uses `:CamelCase:` notation
- [ ] Name is globally unique (not defined elsewhere in the file or imports)
- [ ] Definition starts with the concept name
- [ ] All referenced concepts (`:OtherConcept:`) are already defined above
- [ ] No circular references between concepts
- [ ] Description is clear, concise, and language-agnostic
- [ ] Trimmed per `concise-specs.md`: one plain sentence, no restatement of the name, no rationale
- [ ] Placed inside a `***definitions***` section
