---
name: consolidate-concepts
description: >-
  Gather concept definitions scattered across multiple modules into a single
  shared import module in template/. Removes the moved definitions from the
  original modules and adds the new import to their frontmatter. Use when
  concepts are duplicated or spread across modules and should be centralized.
---

# Consolidate Concepts

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

If a target `.plain` file is in the old syntax (see *Old syntax* in `module-structure.md`), stop, name the file, and point the user to `migrate-plain-syntax`; do not edit it.

## When to Use

- Multiple modules define the same or closely related concepts independently.
- A `requires` chain uses long `exported_concepts` lists to share definitions that would be simpler as an import.
- After a `refactor-module` split, shared concepts ended up duplicated or awkwardly exported.
- The user wants a single source of truth for domain concepts used across modules.

## Guiding Principle

This is a structural refactoring. The **behavior** of every affected module must remain **identical**. No functional spec, implementation req, or test req is changed. Only concept definitions move — from scattered locations into one shared import module — and the modules' `import` lists are updated to reference it.

## Input

The set of modules to consolidate from, plus optionally the name for the new (or existing) import module. If not specified, ask the user.

## Phase 1 — Analyze Concepts Across Modules

1. **Read all source modules.** For each `.plain` file involved, read the full file including frontmatter, definitions, implementation reqs, test reqs, and functional specs. Also read their `import` and `requires` chains.
2. **Build a concept inventory.** For each concept defined across all source modules, record:
   - Where it is defined (which file, which line)
   - Which modules reference it (in definitions, functional specs, implementation reqs, or test reqs)
   - Whether it is currently in an `exported_concepts` list
   - Which other concepts it references in its definition (dependency graph)
3. **Identify consolidation candidates.** A concept should be consolidated if:
   - It is defined in one module but referenced by specs in another module (currently shared via `exported_concepts`)
   - It is duplicated across multiple modules
   - It is a foundational domain concept that logically belongs in a shared vocabulary
4. **Identify concepts that should stay local.** A concept should remain in its module if:
   - It is only used within that single module's specs and definitions
   - It is an internal implementation detail not meaningful outside that module

## Phase 2 — Plan the Consolidation

Present the plan to the user and get explicit confirmation before making changes.

### 2a. Choose the target import module

- **New import module** — create a new `.plain` file in `template/`. Choose a name that reflects the shared domain (e.g., `template/myapp-concepts.plain`).
- **Existing import module** — add the concepts to an import module that is already used by the affected modules. This avoids adding another import reference.

If the target is an existing import module, read it fully to understand what it already contains.

### 2b. Determine which concepts move

For each consolidation candidate, confirm:
- The concept will be removed from its current module's `***definitions***` section.
- The concept will be added to the target import module's `***definitions***` section.
- The concept's full definition text (including all sub-bullets for attributes and constraints) is moved verbatim.

### 2c. Determine concept ordering in the target

Concepts in the import module must be ordered so that every concept is defined **after** any concepts it references. Use the dependency graph from Phase 1 to establish a valid topological order.

### 2d. Determine import and export changes

For each affected module, determine the frontmatter changes:

| Change | When |
|--------|------|
| Add the new import to `import` list | Module does not already import the target |
| Remove concepts from `exported_concepts` | Concepts that were exported only to share definitions — now handled by the import |
| Keep concepts in `exported_concepts` | Concepts that downstream modules still need via export (because those downstream modules do not import the new template) |

**Important:** `import` provides definitions to the importing module. `exported_concepts` on a `requires` module provides concepts to downstream modules in the build chain. If a downstream module will now `import` the shared template directly, the concept can be removed from `exported_concepts`. If a downstream module does **not** import the template, the concept must remain exported.

### 2e. Present the plan

Summarize for the user:
- Target import module (new or existing) and its path
- List of concepts being moved, with source module for each
- List of concepts staying local (and why)
- Frontmatter changes per module (`import` additions, `exported_concepts` removals)
- Confirmation that no functional specs, implementation reqs, or test reqs are changing

Get explicit user confirmation before proceeding.

## Phase 3 — Execute

### 3a. Create or update the import module

If creating a new import module:
1. Create `template/<name>.plain` with YAML frontmatter. If it needs concepts from another import, add that to its own `import` list.
2. Add a `***definitions***` section with all consolidated concepts in dependency order.
3. Do **not** add `***functional specs***` — import modules must not contain them.

If updating an existing import module:
1. Read the current file.
2. Insert the new concepts into the `***definitions***` section, respecting dependency order relative to existing concepts.
3. Verify no concept name collisions with concepts already in the file or its own imports.

### 3b. Update each source module

For each module that had concepts moved out:

1. **Remove the concept definitions** from the module's `***definitions***` section. Remove the full definition including all sub-bullets.
2. **Add the import** to the module's YAML frontmatter `import` list (if not already present).
3. **Update `exported_concepts`** — remove concepts that no longer need to be exported (see 2d).
4. **Do not touch** `***functional specs***`, `***implementation reqs***`, or `***test reqs***` — concept references (`:ConceptName:`) in these sections remain unchanged since the concept is now provided by the import.

### 3c. Update downstream modules (if applicable)

If concepts were removed from a module's `exported_concepts` and downstream modules relied on them:
1. Add the new import to the downstream module's `import` list so it gets the concepts directly.
2. Verify the downstream module's specs can still resolve all concept references.

## Phase 4 — Verify

### 4a. Concept availability check

For every affected module (source modules, downstream modules, and the import module itself):
- [ ] Every `:Concept:` referenced in functional specs is resolvable (defined locally, via import, or via exported concepts from requires)
- [ ] Every `:Concept:` referenced in definitions is defined before the concept that references it
- [ ] Every `:Concept:` referenced in implementation reqs and test reqs is resolvable

### 4b. No duplicates check

- [ ] No concept is defined in both the import module and a source module
- [ ] No concept is defined in both the import module and another import that a source module uses
- [ ] Concept names are globally unique across each module's full resolution scope (local + imports + requires exports)

### 4c. Definition integrity check

- [ ] Each moved concept's definition text is identical to the original — no rewording, no lost sub-bullets
- [ ] Concept ordering in the import module respects the dependency graph (no forward references)

### 4d. No behavioral change check

- [ ] No `***functional specs***` were modified in any module
- [ ] No `***implementation reqs***` were modified in any module
- [ ] No `***test reqs***` were modified in any module
- [ ] No test plain file was modified

### 4e. Structural validation

For the import module:
- [ ] File is in the `template/` directory
- [ ] Does not contain `***functional specs***`
- [ ] Does not use `requires`
- [ ] YAML frontmatter is correctly formatted

For each source module:
- [ ] YAML frontmatter `import` list includes the target import module
- [ ] `exported_concepts` is correct (no over-export, no missing exports)
- [ ] Module still has at least one functional spec and one implementation req

### 4f. Read all modified files

Read each modified `.plain` file in full and present the changes to the user for approval. If the user requests changes, apply them and re-verify.

## Common Pitfalls

### Moving a concept that is only used locally
If a concept is only referenced within a single module, consolidating it into a shared import adds unnecessary coupling. Keep it local.

### Forgetting to update downstream modules
When a concept is removed from `exported_concepts`, any module that `requires` the source module and references that concept will break — unless it now imports the shared template. Always trace the full dependency chain.

### Breaking concept ordering
Concepts in the import module must be topologically ordered. If `:Meal:` references `:MealType:` in its definition, then `:MealType:` must appear first. The source modules may have had them in the right order locally, but merging concepts from different modules requires re-establishing a valid order.

### Creating circular imports
An import module cannot `import` a module that directly or indirectly imports it back. If the shared concepts reference concepts from an existing template, the new import module should itself import that template — not the other way around.

### Removing concepts from exported_concepts prematurely
Only remove a concept from `exported_concepts` if **every** downstream module that needs it will now get it via `import`. If even one downstream module does not import the shared template, the export must stay.

## Validation Checklist

- [ ] User confirmed the consolidation plan before execution
- [ ] All moved concepts are defined in the import module with identical text
- [ ] Concepts are in valid dependency order in the import module
- [ ] No concept is defined in both the import module and a source module
- [ ] Every affected module's `import` list includes the target import module
- [ ] `exported_concepts` updated correctly — no missing exports, no unnecessary exports
- [ ] All concept references in all affected modules resolve correctly
- [ ] No functional specs, implementation reqs, test reqs, or test plain files were modified
- [ ] Import module is in `template/` and has no functional specs or requires
- [ ] No circular imports introduced
- [ ] Downstream modules updated if needed
- [ ] User approved the final result
