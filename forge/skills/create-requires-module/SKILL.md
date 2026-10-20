---
name: create-requires-module
description: >-
  Create a ***plain module that uses requires to depend on another module in
  the build chain. Use when the user wants to create a new .plain file that
  builds on top of a previously built module, inheriting its functional specs
  and generated code as a starting point.
---

# Create Requires Module

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet.

If a target `.plain` file is in the old syntax (see *Old syntax* in `module-structure.md`), stop, name the file, and point the user to `migrate-plain-syntax`; do not edit it.

## What Requires Does

`requires` attaches the current module to the project's build chain. The required module is built **before** the current one, and its generated code — the accumulated output of that module and all its ancestors — is copied as the starting point. The current module does not need to functionally extend the required module, but their outputs are never independent: the current module's code physically contains the required module's.

When this module is rendered:
- The required module's generated code (`plain_modules/<required_module>/code`) is copied as the starting point.
- The `***functional specs***` of the required module **and all its ancestors** become visible as **previous functional specs**.
- Of the required module's definitions, only the concepts in its `exported_concepts` are visible, each with its full definition text. Export visibility is **not** transitive — to see an ancestor's exports, list that ancestor in `requires` too.
- The required module's test plain files stay with the required module. The new module gets its own test plain files under `tests/<module>/`, one per functionality it adds (see `test-plain-files.md`).

All modules connected by `requires` form a single tree with a common root. **Diamond joins are prohibited**: multiple `requires` entries must lie on one root-to-tip ancestor path. The deepest entry is the attachment point; the other entries exist only to make those ancestors' exports visible.

Use `requires` for:
- Building on top of an existing module's functionality
- Attaching a module at the right point in the build chain, even when it addresses a different concern

If you only need shared definitions and reqs (no functional specs, no generated code), use `import` instead — see the `create-import-module` skill.

## Workflow

1. **Identify the attachment point.** Determine which existing module this new module attaches after in the build chain. That module must already exist and be renderable. If listing additional modules, verify each is an ancestor of the attachment point — no diamond joins.
2. **Create the `.plain` file at the repository root** with YAML frontmatter containing the `requires` field. Modules with functional specs live at the root, not in `template/`.
3. **Review the functional specs of the whole ancestor chain** — they will be treated as previous requirements. Your new functional specs must not conflict with any of them.
4. **Review each listed module's `exported_concepts`** — only those concepts are available to reference; an ancestor's exports require listing that ancestor.
5. **Add module-specific content** — definitions, implementation reqs, test reqs, and functional specs unique to this module. Add every functional spec through `add-functional-spec` or `add-functional-specs`, which also create its test plain file.
6. **Check for conflicts** between your new functional specs and any spec in the ancestor chain.

## Format

The `requires` field is a list of module paths in the YAML frontmatter:

```plain
---
requires:
  - base_module
import:
  - shared_template
description: Extended module that builds on base_module
---

***definitions***

- :NewFeature: is a feature added by this module.

***functional specs***

# new-feature
:NewFeature: is available.
```

A module can use both `requires` and `import` together. `requires` points to other root-level modules; `import` resolves from the default `template/` directory (no prefix needed).

Multiple `requires` entries are legal only when they lie on one ancestor path (e.g., `requires: [auth, messaging]` where `messaging` itself requires `auth`). The deepest entry (`messaging`) is the attachment point; `auth` is listed only to make its exports visible.

## Exported Concepts

The required module controls what concepts are visible via `exported_concepts`:

```plain
> In the required module's frontmatter:
---
exported_concepts: [":StorageClient:", ":BackupResult:"]
---
```

Only `:StorageClient:` and `:BackupResult:` would be available to modules that `require` this one, each with its full definition text. All other concepts from the required module are internal.

## Chronological Ordering with Requires

Functional specs from the whole `requires` ancestor chain are considered **previous functional specs**. This means:
- They are already rendered and their code exists.
- Your new specs are rendered after them, with full awareness of what they defined.
- Your new specs must not conflict with any spec in the ancestor chain.
- The renderer sees the chain's functional specs as context when rendering yours.

The current module may or may not be functionally related to the required module — `requires` places it at the right point in the accumulating build chain either way.

## Import vs Requires

| Aspect | `import` | `requires` |
|--------|----------|------------|
| Pulls in definitions | Yes | No (only `exported_concepts`) |
| Pulls in implementation reqs | Yes | No |
| Pulls in test reqs | Yes | No |
| Pulls in functional specs | No | Yes (as previous requirements, transitively) |
| Copies generated code | No | Yes (accumulated ancestor chain) |
| Typical use | Templates, shared definitions | Attaching a module to the build chain |

## Validation Checklist

- [ ] Module file is at the repository root (not in `template/`)
- [ ] Required module exists and is renderable
- [ ] All `requires` entries lie on one ancestor path — no diamond joins
- [ ] The deepest `requires` entry is the intended attachment point
- [ ] Every listed module's `exported_concepts` provide the concepts you need
- [ ] New functional specs do not conflict with any spec in the ancestor chain
- [ ] Module has at least one functional spec and one implementation req
- [ ] Every functional spec has its test plain file under `tests/<module>/`
- [ ] Both `requires` and `import` are used correctly (not mixed up)
- [ ] YAML frontmatter is correctly formatted between `---` markers
