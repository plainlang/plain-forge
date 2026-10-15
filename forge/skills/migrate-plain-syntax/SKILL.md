---
name: migrate-plain-syntax
description: >-
  Convert a ***plain project from the old syntax to the current one: give
  every functional spec a # func-id heading, move nested ***acceptance tests***
  into test plain files under tests/<module>/, draft conformance scenarios
  with the user for every functionality, and rename the frontmatter directives
  requires and import to base and imports. Use when a skill or plain-parser
  reports the old syntax, or when the user asks to migrate or upgrade old
  .plain files.
---

# Migrate Plain Syntax

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet. This skill needs `module-structure.md`, `func-specs.md`, `semantic-ids.md`, `test-plain-files.md`, `base-modules.md`, and `import-modules.md`.

## What changes

| Old syntax | Current syntax |
|---|---|
| A functional spec is a top-level `- ` bullet with nested `  - ` sub-bullets | A functional spec is a `# <func-id>` heading, a statement line, and `- ` clarification bullets |
| `***acceptance tests***` nested under a functional spec | `***acceptance tests***` section of the functionality's test plain file `tests/<module>/<func-id>.plain` |
| The renderer invents conformance tests | `***conformance tests***` section of the test plain file holds at least one scenario per functionality |
| `requires:` in the frontmatter | `base:` |
| `import:` in the frontmatter | `imports:` |

There is no backward compatibility: a project in the old syntax does not render, and no other skill edits it. The migration converts the whole project in one pass.

## Scope

- Every `.plain` file of the project: the root modules, the import modules in the template directory, and every module reachable through `base` and `imports`. A half-migrated project fails the parser.
- Spec text is copied verbatim; only its shape changes. Rewording, trimming, and splitting are separate work for `add-feature`, `break-down-func-spec`, or `resolve-section-ownership` afterwards.
- Generated output under `plain_modules/` is never edited. Nothing is rendered.

## Workflow

### 1. Inventory and confirm

1. List every `.plain` file in the project. Follow the `requires` / `base` and `import` / `imports` chains from each root module so no module is missed.
2. For each file, record which old-syntax markers it holds: top-level `- ` bullets in `***functional specs***`, nested `***acceptance tests***` sections, `requires:`, `import:`.
3. Read every `config.yaml` to learn whether conformance tests are enabled for each module (a `conformance-tests-script` entry).
4. Show the user the inventory (files, markers, conformance on or off per module) and get explicit confirmation before writing anything.

### 2. Rename the directives

In every frontmatter, rename the key `requires:` to `base:` and the key `import:` to `imports:`. Values stay unchanged. `{% include %}` lines and `exported_concepts` / `required_concepts` stay unchanged.

### 3. Give every functionality a func-id

For each root module, walk the `***functional specs***` section top to bottom:

1. For every top-level `- ` bullet, propose a func-id per `semantic-ids.md`: a short slug that names the behavior (`add-task`, `export-csv`), unique in the module. Show the module's full list of proposed ids to the user in one `AskUserQuestion` and apply their edits.
2. Rewrite each functionality in place:
   - The `# <func-id>` heading on its own line.
   - The bullet text, without the leading `- `, as the statement line. A bare continuation line of the bullet is de-indented and kept as part of the statement.
   - Each nested `  - ` sub-bullet de-indented by two spaces, so it becomes a `- ` clarification; deeper nesting is de-indented the same way.
   - One blank line between functionalities.
3. Keep comment lines (`>`) and Liquid tags where they are.
4. Cut each nested `***acceptance tests***` block out of the core spec and keep its bullets for step 4, together with the func-id they belonged to.

### 4. Move the acceptance tests into test plain files

For every functionality that had nested acceptance tests, create `tests/<module>/<func-id>.plain` with the frontmatter keys `module:` (the core spec's file name without `.plain`) and `func_id:`, an empty `***conformance tests***` section, and an `***acceptance tests***` section holding one scenario per old acceptance test:

- A `# <scenario-id>` heading per test, with a slug derived from the test text, unique in the file.
- The old test text as the scenario body, verbatim. When the text already separates setup, action, and result, write it as `given:` / `when:` / `then:` lists; when a faithful split is not obvious, keep the prose. Free text is valid scenario text.

Show each created file to the user as a snippet and apply their edits.

### 5. Draft conformance scenarios

When conformance tests are enabled for a module, every functionality needs at least one conformance scenario. Walk the module's functionalities in order and invoke `add-test-scenarios` for each one; it creates the test plain file when step 4 did not, drafts the scenarios from the functional spec, and reviews them with the user one functionality at a time.

When `plain_modules/<module>/tests/` holds conformance tests from an earlier render, read the folder of the functionality first: each generated test is a candidate scenario the user can keep, edit, or drop, which is faster than drafting from the spec alone.

When conformance tests are not enabled for a module, skip this step and say so; the test plain files created in step 4 keep an empty `***conformance tests***` section.

### 6. Verify

1. No `***functional specs***` section holds a top-level `- ` bullet; every functionality starts with a `# <func-id>` heading.
2. No core spec holds an `***acceptance tests***` section.
3. No frontmatter holds `requires:` or `import:`.
4. Func-ids are unique per module; scenario-ids are unique per functionality.
5. Every test plain file binds to an existing functionality; when conformance tests are enabled, every functionality has at least one conformance scenario.
6. The number of functionalities per module equals the number of top-level bullets before the migration, and every old acceptance test appears once as an acceptance scenario.
7. Run `plain-healthcheck`. Until the plain-parser release that parses the current syntax is installed, its parser step reports that it is suspended; the other checks still run.

### 7. Report

Per module: functionalities migrated, directives renamed, acceptance tests moved, test plain files created, conformance scenarios drafted, and anything the user still has to decide. Remind the user that the project renders only with a renderer that reads test plain files.

## Rules

- One pass over the whole project; never leave a module in the old syntax.
- Spec text verbatim; the shape changes, the words do not.
- The order of functionalities is unchanged; func-ids carry no order.
- Func-ids are proposed by this skill and approved by the user before they are written.
- Old acceptance tests become acceptance scenarios, never conformance scenarios; conformance scenarios are drafted from the spec with `add-test-scenarios`.
- Nothing under `plain_modules/` is edited.

## Format

Before:

```plain
---
requires:
  - core
import:
  - stack
---

***functional specs***

- A :User: can add a :Task:. Only valid :Task: items are added.
  - The name must be at least 3 characters long.

  ***acceptance tests***
  - Adding a :Task: named "Buy milk" to an empty :TaskList: shows one :Task:.
```

After, the core spec:

```plain
---
base:
  - core
imports:
  - stack
---

***functional specs***

# add-task
A :User: can add a :Task:. Only valid :Task: items are added.
- The name must be at least 3 characters long.
```

After, `tests/<module>/add-task.plain`, with the conformance scenario drafted by `add-test-scenarios`:

```plain
---
module: <module>
func_id: add-task
---

***conformance tests***

# reject-short-name
given:
  - :App: is running with an empty :TaskList:
when:
  - :User: adds a :Task: named "Go"
then:
  - :TaskList: stays empty

***acceptance tests***

# add-to-empty-list
Adding a :Task: named "Buy milk" to an empty :TaskList: shows one :Task:.
```

## Validation Checklist

- [ ] Every `.plain` file of the project was inventoried and the user confirmed the pass
- [ ] `requires:` and `import:` renamed to `base:` and `imports:` in every frontmatter
- [ ] Every functionality has a `# <func-id>` heading approved by the user; text verbatim; order unchanged
- [ ] No `***acceptance tests***` section remains in a core spec; every old acceptance test is an acceptance scenario in a test plain file
- [ ] Every functionality has at least one conformance scenario when conformance tests are enabled for its module
- [ ] Func-ids unique per module; scenario-ids unique per functionality
- [ ] `plain-healthcheck` run; its report shown to the user
- [ ] Nothing under `plain_modules/` was edited
