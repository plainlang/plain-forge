---
description: Rules for using exported_concepts in .plain files
---

# Rules for `exported_concepts`

When adding or editing `exported_concepts` in a `.plain` file's frontmatter, always follow these rules:

## What exported_concepts does
- `exported_concepts` declares which concepts from this module are visible to modules that `require` it
- Concepts not listed in `exported_concepts` are internal to the module and invisible to downstream modules
- Only modules that use `requires` receive exported concepts — `import` gives access to all definitions, not just exports
- An exported concept is visible with its full definition text

## When to use it
- Use `exported_concepts` on any module that other modules will `require`
- List only the concepts that downstream modules actually need to reference
- Keep the exported surface small — expose only what is necessary

## Concepts must be defined
- Every concept listed in `exported_concepts` must be defined in the module's own `***definitions***` section
- Do not export concepts that are not defined in the module

## Exports are not transitive
- If module A exports `:Foo:` and module B `requires` A, a module C with `requires: [B]` does **not** gain access to `:Foo:`
- If module C also needs `:Foo:`, it should list A in its `requires` as well (`requires: [A, B]`) or get `:Foo:` through a common import module

## Format

```plain
---
import:
  - airplain
exported_concepts: [":User:", ":JwtToken:"]
description: Exports User and JwtToken for downstream modules
---
```

List concepts as a YAML array with each concept in `:ConceptName:` notation.
