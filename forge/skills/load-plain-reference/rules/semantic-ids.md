---
description: Syntax, uniqueness, and use of semantic func-ids and scenario-ids in .plain files
---

# Rules for semantic IDs

Every functionality in `***functional specs***` and every scenario in a test plain file carries a semantic ID. The ID is the stable name that test plain files, render commands, render state, change detection, logs, and generated tests use for that functionality or scenario. Always follow these rules when writing or reading one.

## Two kinds of ID

| ID | Written as | Identifies | Unique within |
|---|---|---|---|
| func-id | `# <func-id>` heading in `***functional specs***` of a spec plain file | one functionality | its module |
| scenario-id | `# <scenario-id>` heading in `***conformance tests***` or `***acceptance tests***` of a test plain file | one scenario | its functionality, across every test plain file bound to that functionality |

## Syntax
- Lowercase letters, digits, and hyphens only: `add-task`, `export-csv-2`, `ctrl-d-exit`
- The heading is `# ` (hash, one space) followed by the ID and nothing else

## Uniqueness
- A func-id is unique in its module; two modules may use the same func-id
- A scenario-id is unique for its functionality after every test plain file bound to that functionality is merged; two functionalities may use the same scenario-id
- Before adding an ID, search the module (or the functionality's test plain files) for the same heading; a duplicate is a syntax error that `plain-parser check` reports

## Stability
- An ID is an identity, not a label: a functionality keeps its func-id for as long as it exists, even when its text changes
- To the renderer, renaming a func-id is deleting one functionality and adding another; rename only when the user asks, then rename `func_id:` in every test plain file bound to it and move the file to the new conventional path
- Never renumber or reorder IDs; the order of the headings in the file is the render order, the ID carries no order

## How coding agents use IDs
- Name a functionality by its func-id (`<module>:<func-id>` when the module is not obvious) in questions to the user, in review snippets, in commit messages, and in render commands; never by position ("the third spec")
- Pick the func-id before writing the functional spec text, check that it is unique in the module, then write the heading and the body (see `func-specs.md`)
- When conformance tests are enabled, a new functionality is finished only when its test plain file exists, by convention at `tests/<module>/<func-id>.plain` (see `test-plain-files.md`)
- A generated conformance or acceptance test carries the scenario-id of the scenario it implements; when a test fails, the scenario-id in its name leads back to the scenario text
- Everything about one functionality is found through its func-id: the `# <func-id>` heading in the spec plain file, the test plain files whose frontmatter names it, and the generated tests labelled with its scenario-ids

## Format

```plain
***functional specs***

# add-task
A :User: can add a :Task:. Only valid :Task: items are added.

# delete-task
A :User: can delete a :Task:.
```
