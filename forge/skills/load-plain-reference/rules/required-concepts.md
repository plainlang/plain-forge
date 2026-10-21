---
description: Rules for using required_concepts in .plain files
---

# Rules for `required_concepts`

When adding or editing `required_concepts` in a `.plain` file's frontmatter, always follow these rules:

## What required_concepts does
- `required_concepts` declares concepts that any module importing this file **must** define
- It creates a contract: the import module references these concepts but does not define them — the importing module is responsible for providing definitions
- This is used exclusively on import modules

## When to use it
- Use `required_concepts` when an import module references concepts that vary per project or per importing module
- The import module can reference these concepts in its definitions, implementation reqs, or test reqs — but their actual definitions come from whoever imports the file

## Importing module must satisfy the contract
- Every concept listed in `required_concepts` must be defined somewhere visible to the importing module — in its own `***definitions***` section or in another module it imports
- If the importing module does not define a required concept, the spec is invalid
- Check `required_concepts` of all imported modules before finalizing a module

## Do not define required concepts locally
- The import module that declares `required_concepts` must **not** define those concepts itself
- The whole point is that the importing module provides the definition

## Format

```plain
---
required_concepts: [":AppName:", ":AppConfig:"]
description: Imported module that requires AppName and AppConfig to be defined by the importer
---

***definitions***
- :MainFile: is the entry point for :AppName:.

***implementation reqs***
- :MainFile: should load :AppConfig: on startup.
```

In this example, `:AppName:` and `:AppConfig:` are referenced but not defined — the module that imports this import module must define them.

List concepts as a YAML array with each concept in `:ConceptName:` notation.
