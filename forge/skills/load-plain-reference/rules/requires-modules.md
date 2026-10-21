---
description: Rules for creating and using requires modules in .plain files
---

# Rules for requires modules

When creating or editing a `.plain` file that uses `requires`, or one that is referenced in another `.plain` file's `requires` directive, always follow these rules:

## What requires does

- `requires` attaches the current module to the project's **build chain**: the required module is built first, and its generated code is copied as the starting point for the current module
- The copied code is the required module's **accumulated** output — it already contains the code of all of that module's own ancestors
- The `***functional specs***` of the required module **and of all its ancestors** become visible as **previous functional specs** — this visibility **is transitive** down the whole chain
- Of a required module's definitions, only the concepts listed in its `exported_concepts` are visible; the module's other definitions stay internal. Each exported concept arrives with its full definition text
- Export visibility **is not transitive**: an ancestor's exports are visible only if that ancestor is itself listed in `requires`

## Chain topology

- All modules connected by `requires` form a single **tree** with a common root: code accumulates along each branch, and branches never reconverge
- **Diamond joins are prohibited.** A module must not require two modules from divergent branches — there is no way to merge two divergent codebases into one starting point
- When `requires` lists multiple modules, every entry must lie on **one root-to-tip ancestor path**: each listed module must be an ancestor of the deepest one
- The **deepest entry is the attachment point** — it alone determines the build order and the starting code. The other entries add nothing to ordering; they exist **only** to make those ancestors' `exported_concepts` visible
- Branching outward is fine: two modules may each require the same parent, creating independent branches (and therefore independent top modules)

## Tech stack must match (hard rule)

- Because the required module's generated code is copied as the starting point and the renderer continues building on top of it with a single toolchain, two modules can only be linked with `requires` when they target the **same language, framework, and runtime**
- A runtime / network dependency between systems is **not** a reason to use `requires`
- Example of the mistake: a React frontend that talks to a Python/FastAPI backend over HTTP must **not** `requires: [backend]` — the stacks differ
- Model that pair as two independent root modules (each with its own `config.yaml` and test scripts) and express the contract through a shared API schema in `resources/` or shared concepts in an `import`ed module — never through `requires`

## Building upon but not necessarily extension

- The current module does not need to functionally extend the required module — it may address a completely different concern
- Even so, the two are never independent artifacts: the current module's output physically contains the required module's code, because both are stages of one accumulating codebase
- Use `requires` to place a module at the right point in that lineage, whether or not it builds on the required module's functionality

## Conflict prevention

- The current module's functional specs must not conflict with the specs of **any module in its ancestor chain** — all of them are previous functional specs
- The renderer sees the whole chain's specs as prior requirements/context when rendering the current module
- Review the ancestor chain's functional specs before adding new ones

## Exports are the only visible definitions

- Only concepts listed in a required module's `exported_concepts` are available, and only for modules explicitly listed in `requires`
- Each exported concept is available with its full definition text
- Other concepts from required modules are internal and invisible
- To reference a concept exported by an ancestor deeper in the chain, list that ancestor in `requires` as well
- If you need shared definitions across branches or stacks, use `import` for that — not `requires`

## File locations

- Modules that use `requires` live at the **repository root** — they are functional modules with specs
- `requires` paths point to other root-level modules (e.g., `auth`, `messaging`)
- Never `require` an import module — import modules are for `import` only

## Format

```plain
---
requires:
  - auth
import:
  - airplain
description: Module built on top of auth, importing shared definitions
---
```

A module can list multiple required modules **only when they lie on one ancestor path**. Here `messaging` itself requires `auth`, so `auth` is an ancestor of `messaging`; the module attaches after `messaging` and lists `auth` only to see its exports:

```plain
---
requires:
  - auth
  - messaging
import:
  - airplain
---
```
