---
name: refactor-module
description: >-
  Split a large ***plain module into smaller modules grouped by logical domain.
  The resulting modules are connected via a base chain so that functionality
  is 100% preserved. Use when a module has grown too large and its functional
  specs span multiple distinct concerns that would be clearer as separate modules.
---

# Refactor Module

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## When to Use

- A module has many functional specs spanning multiple distinct domains or feature areas.
- The module is hard to reason about because unrelated concerns are interleaved.
- New features are difficult to add because the module's scope is too broad.
- The user explicitly asks to split or reorganize a module.

## Guiding Principle

The refactoring is purely structural. The **combined behavior** of the resulting modules must be **identical** to the original module. No functional spec is added, removed, or weakened. The split is semantic — grouping related specs together — not behavioral.

## Input

The `.plain` file to refactor, plus guidance from the user on the desired grouping (or ask the user to confirm your proposed grouping).

## Phase 1 — Analyze the Current Module

1. **Read the entire `.plain` file** — frontmatter, definitions, implementation reqs, test reqs, and all functional specs. Also read any `imports` and `base` chains to understand the full context.
2. **Inventory the functional specs.** List each functionality by its func-id and note which `:Concepts:` it references. Build a dependency map: which specs depend on earlier specs (by referencing behavior or state they introduced)?
3. **Inventory the definitions.** For each concept, note which functional specs reference it. Identify concepts that are used across multiple logical groups vs. concepts used only within one group.
4. **Identify logical groups.** Look for natural seams — clusters of functional specs that share concepts, represent a cohesive domain, or describe a single feature area. Common groupings:
   - Data model setup and CRUD operations
   - Business logic and processing rules
   - UI screens and navigation
   - Integrations and external interfaces
   - Statistics, reporting, and analytics
5. **Verify group independence.** Each group's specs should form a contiguous or near-contiguous block in chronological order. If a group's specs are scattered and interleaved with other groups, the split boundary may need adjustment.

## Phase 2 — Plan the Split

Present the proposed split to the user and get explicit confirmation before making any changes.

### 2a. Define the module chain

The modules form a `base` chain that preserves the original chronological ordering of functional specs. The first module in the chain contains the earliest specs; each subsequent module lists the previous one under `base` and adds the next logical group.

```
original-module
  ↓ splits into
module-group-a  (no base — this is the chain root)
module-group-b  (base: module-group-a)
module-group-c  (base: module-group-b)
```

If the original module already had `base` or `imports` dependencies, the first new module inherits them.

### 2b. Assign functional specs to modules

Place each functional spec in exactly one module. The placement must respect chronological ordering:
- Within each module, the specs appear in the same relative order as in the original.
- Across the chain, the ordering is preserved: all specs in module A come before all specs in module B, which come before all specs in module C.
- A spec **cannot** move to an earlier module than a spec it depends on.

### 2c. Assign definitions to modules

For each concept, determine where it belongs:

| Concept usage | Placement |
|---------------|-----------|
| Used only within one module's specs | Define in that module |
| Used across multiple modules in the chain | Define in the first module that uses it, and add to that module's `exported_concepts` |
| Already defined in an import template | Leave in the import — no change needed |

If many concepts are shared across all modules, consider creating a new import module (template) to hold them. This avoids long `exported_concepts` lists and keeps definitions centralized. Use the `create-import-module` skill for this.

### 2d. Assign implementation reqs and test reqs

- Reqs that apply to all modules should live in a shared import template. If one already exists, keep them there.
- Reqs specific to a single module's domain move to that module.
- When in doubt, keep reqs in the shared template — duplication across modules is worse than a slightly broad template.

### 2e. Present the plan

Summarize for the user:
- Number of resulting modules and their names
- Which functional specs go in each module (listed by func-id)
- The `base` chain order
- Any new import module being created
- Which concepts are exported from each module
- Confirmation that all original specs are accounted for (none lost)

Get explicit user confirmation before proceeding.

## Phase 3 — Execute the Split

Create the new modules in order, from the root of the chain upward.

### 3a. Create or update the import template (if needed)

If shared definitions or reqs are being moved to a new import template, create it first using the `create-import-module` skill.

### 3b. Create the chain root

Create the first module in the chain:
1. Set the YAML frontmatter — inherit the original module's `imports` references. Add `exported_concepts` for any concepts that downstream modules need.
2. Add the `***definitions***` section with concepts used by this module's specs and concepts that need to be exported.
3. Add `***implementation reqs***` and `***test reqs***` specific to this module (if not fully covered by the import template).
4. Add the `***functional specs***` assigned to this module, preserving their original order and exact wording.
5. Move the test plain files of the moved functionalities to `tests/<new-module>/` and set their `module:` key to the new module name; func-ids and scenario text stay unchanged.

### 3c. Create subsequent modules

For each subsequent module in the chain:
1. Set `base` to the previous module in the chain. Set `imports` if it uses shared templates.
2. Add `exported_concepts` for any concepts that later modules in the chain need.
3. Add `***definitions***` for concepts local to this module. Do **not** redefine concepts already available via `base` (exported) or `imports`.
4. Add `***implementation reqs***` and `***test reqs***` specific to this module.
5. Add the `***functional specs***` assigned to this module, preserving their original order and exact wording.
6. Move the test plain files of the moved functionalities the same way.

### 3d. Handle the original module file

After all new modules are created:
- If the original module is being fully replaced (all specs moved out), delete it or rename it to avoid confusion.
- If other modules listed the original module under `base`, update them to list the last module in the new chain instead — its accumulated code and previous functional specs cover the whole chain. Exported concepts are **not** transitive, though: if a downstream module references a concept now exported by an earlier module in the new chain, it must list that earlier module under `base` as well.

## Phase 4 — Verify

### 4a. Completeness check

This is the most critical verification. Walk through every functional spec from the original module and confirm it appears in exactly one of the new modules. Nothing may be lost, weakened, modified, or left implicit.

Checklist:
- [ ] Total spec count across all new modules equals the original spec count
- [ ] Each spec's text is identical to the original (no rewording) and keeps its func-id
- [ ] Each functionality's test plain file moved with it, with `module:` updated and scenarios intact

### 4b. Chronological ordering check

Verify that the chronological order of all functional specs — when read across the base chain from root to leaf — matches the original ordering exactly. A spec must not appear before a spec it depends on.

### 4c. Concept availability check

For each module, verify:
- [ ] Every `:Concept:` referenced in its specs is either defined locally, available via `imports`, or available via `exported_concepts` from a module listed under `base`
- [ ] `exported_concepts` includes every concept that downstream modules need
- [ ] No concept name collisions between modules

### 4d. Structural validation per module

For each new module:
- [ ] Has at least one functional spec and one implementation req
- [ ] YAML frontmatter is correctly formatted
- [ ] `base` and `imports` paths are correct
- [ ] Module file is at the repository root (not in `template/`)
- [ ] Specs are language-agnostic
- [ ] All external interfaces remain explicit

### 4e. Read all new modules

Read each new `.plain` file in full and present the final structure to the user for approval. If the user requests changes, apply them and re-verify.

## Common Pitfalls

### Splitting too aggressively
Creating many tiny modules with 1–2 specs each adds overhead without clarity. Aim for modules with 3–10 functional specs each, grouped around a cohesive theme.

### Breaking chronological order
Specs that set up foundational behavior (entry point, database init, core CRUD) must stay in the chain root even if they touch concepts from multiple domains. Only split when specs are cleanly separable.

### Forgetting exported_concepts
If a concept defined in module A is referenced by a spec in module B (which requires A), the concept must be in A's `exported_concepts`. Missing exports cause rendering failures.

### Modifying spec text during the split
This is a refactoring, not a rewrite. Spec text must be copied verbatim. If a spec needs rewording to work in its new module context, that is a sign the split boundary is wrong — adjust the grouping instead.

### Losing test plain files
A test plain file binds to its functionality by `module:` and `func_id:`. When a functionality moves to a new module, its test plain file moves to `tests/<new-module>/` and its `module:` key changes; otherwise the renderer reports a pair that matches no functionality.

## Validation Checklist

- [ ] User confirmed the split plan before execution
- [ ] All original functional specs are present in exactly one new module — none lost
- [ ] Spec text is identical to the original — no rewording
- [ ] Test plain files moved with their functionalities and rebound to the new module
- [ ] Chronological order preserved across the base chain
- [ ] Every referenced `:Concept:` is available in each module (local, import, or exported)
- [ ] `exported_concepts` are correctly set on each module
- [ ] No concept name collisions
- [ ] Each module has at least one functional spec and one implementation req
- [ ] `base` chain is correctly ordered (root → leaf)
- [ ] Original module removed or updated
- [ ] Downstream modules (if any) updated to require the chain tip, plus any earlier chain modules whose exported concepts they reference
- [ ] User approved the final result
