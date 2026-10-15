---
description: Rules for creating and using import modules in .plain files
---

# Rules for import modules

When creating or editing a `.plain` file that uses `imports` or is intended to be imported by other modules, always follow these rules:

## What an import module is
- An import module contains **only** `***definitions***`, `***implementation reqs***`, and/or `***test reqs***`
- It must **not** contain `***functional specs***`
- It must **not** use `base` in its frontmatter
- It may list other import modules under `imports` for layered reuse

## What imports does
- `imports` pulls in `***definitions***`, `***implementation reqs***`, and `***test reqs***` from the target module
- It does **not** pull in `***functional specs***`
- Import paths omit the `.plain` extension

## Concept visibility
- All concepts defined in the imported module become available in the importing module — including concepts the imported module itself imports (layered imports are transitive)
- Check for concept name collisions between imports and local definitions before adding — a collision is rejected as a syntax error ("Concepts were defined multiple times")

## Format

```plain
---
imports:
  - airplain
description: Module that imports shared definitions and reqs
---
```

A module can import multiple modules:

```plain
---
imports:
  - airplain
  - shared_utils
---
```

## Combining imports with base
- A module can use both `imports` and `base` together
- `imports` brings in shared definitions and reqs
- `base` attaches the module to the build chain — accumulated generated code and previous functional specs
- An import module itself must **not** use `base`
