---
name: create-base-module
description: >-
  Create a ***plain module that lists another module under base to build on
  it in the build chain. Use when the user wants to create a new .plain file
  that builds on top of a previously built module, inheriting its functional
  specs and generated code as a starting point.
---

# Create Base Module

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

Before reading or editing any `.plain` file, check it for the old syntax (see *Old syntax* in `module-structure.md`): a top-level `- ` bullet in `***functional specs***`, an `***acceptance tests***` section in a core spec, or `requires:` / `import:` in the frontmatter. If any is present, stop, name the file and the marker, and point the user to `migrate-plain-syntax`; do not edit a file in the old syntax.

## What Base Does

`base` attaches the current module to the project's build chain. The base module is built **before** the current one, and its generated code — the accumulated output of that module and all its ancestors — is copied as the starting point. The current module does not need to functionally extend the base module, but their outputs are never independent: the current module's code physically contains the base module's.

When this module is rendered:
- The base module's generated code (`plain_modules/<base_module>/code`) is copied as the starting point.
- The `***functional specs***` of the base module **and all its ancestors** become visible as **previous functional specs**.
- Of the base module's definitions, only the concepts in its `exported_concepts` are visible, each with its full definition text. Export visibility is **not** transitive — to see an ancestor's exports, list that ancestor under `base` too.
- The base module's test plain files stay with the base module. The new module gets its own test plain files under `tests/<module>/`, one per functionality it adds (see `test-plain-files.md`).

All modules connected by `base` form a single tree with a common root. **Diamond joins are prohibited**: multiple `base` entries must lie on one root-to-tip ancestor path. The deepest entry is the attachment point; the other entries exist only to make those ancestors' exports visible.

Use `base` for:
- Building on top of an existing module's functionality
- Attaching a module at the right point in the build chain, even when it addresses a different concern

If you only need shared definitions and reqs (no functional specs, no generated code), use `imports` instead — see the `create-import-module` skill.

## Workflow

1. **Identify the attachment point.** Determine which existing module this new module attaches after in the build chain. That module must already exist and be renderable. If listing additional modules, verify each is an ancestor of the attachment point — no diamond joins.
2. **Create the `.plain` file at the repository root** with YAML frontmatter containing the `base` field. Modules with functional specs live at the root, not in `template/`.
3. **Review the functional specs of the whole ancestor chain** — they will be treated as previous requirements. Your new functional specs must not conflict with any of them.
4. **Review each listed module's `exported_concepts`** — only those concepts are available to reference; an ancestor's exports require listing that ancestor.
5. **Add module-specific content** — definitions, implementation reqs, test reqs, and functional specs unique to this module. Add every functional spec through `add-functional-spec` or `add-functional-specs`, which also create its test plain file.
6. **Check for conflicts** between your new functional specs and any spec in the ancestor chain.

## Format

The `base` field is a list of module names in the YAML frontmatter:

```plain
---
base:
  - core_module
imports:
  - shared_template
description: Extended module that builds on core_module
---

***definitions***

- :NewFeature: is a feature added by this module.

***functional specs***

# new-feature
:NewFeature: is available.
```

A module can use both `base` and `imports` together. `base` names other root-level modules; `imports` resolves from the default `template/` directory (no prefix needed).

Multiple `base` entries are legal only when they lie on one ancestor path (e.g., `base: [auth, messaging]` where `messaging` itself has `auth` as its base). The deepest entry (`messaging`) is the attachment point; `auth` is listed only to make its exports visible.

## Exported Concepts

The base module controls what concepts are visible via `exported_concepts`:

```plain
> In the base module's frontmatter:
---
exported_concepts: [":StorageClient:", ":BackupResult:"]
---
```

Only `:StorageClient:` and `:BackupResult:` would be available to modules that list this one under `base`, each with its full definition text. All other concepts from the base module are internal.

## Chronological Ordering with Base

Functional specs from the whole `base` ancestor chain are considered **previous functional specs**. This means:
- They are already rendered and their code exists.
- Your new specs are rendered after them, with full awareness of what they defined.
- Your new specs must not conflict with any spec in the ancestor chain.
- The renderer sees the chain's functional specs as context when rendering yours.

The current module may or may not be functionally related to the base module — `base` places it at the right point in the accumulating build chain either way.

## Imports vs Base

| Aspect | `imports` | `base` |
|--------|-----------|--------|
| Pulls in definitions | Yes | No (only `exported_concepts`) |
| Pulls in implementation reqs | Yes | No |
| Pulls in test reqs | Yes | No |
| Pulls in functional specs | No | Yes (as previous requirements, transitively) |
| Copies generated code | No | Yes (accumulated ancestor chain) |
| Typical use | Templates, shared definitions | Attaching a module to the build chain |

## Validation Checklist

- [ ] Module file is at the repository root (not in `template/`)
- [ ] Base module exists and is renderable
- [ ] All `base` entries lie on one ancestor path — no diamond joins
- [ ] The deepest `base` entry is the intended attachment point
- [ ] Every listed module's `exported_concepts` provide the concepts you need
- [ ] New functional specs do not conflict with any spec in the ancestor chain
- [ ] Module has at least one functional spec and one implementation req
- [ ] Every functional spec has its test plain file under `tests/<module>/`
- [ ] Both `base` and `imports` are used correctly (not mixed up)
- [ ] YAML frontmatter is correctly formatted between `---` markers
