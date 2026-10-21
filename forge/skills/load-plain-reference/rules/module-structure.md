---
description: File-level structure of .plain modules — frontmatter, sections, ordering, and section ownership
---

# Rules for `.plain` module structure

When creating a new `.plain` file or reviewing the structure of a whole file, always follow these rules. Section *content* rules live in the per-section rule files linked below — this file covers only file-level structure.

## File skeleton
- A `.plain` file is one **module**: optional YAML frontmatter between `---` markers, followed by sections marked with `***section name***` headers
- The frontmatter, when present, must be the first thing in the file
- Every content line inside a section must be a `- ` list item — see `bullet-continuation.md`
- Every line must be as short and plain as its content allows — see `concise-specs.md`

## Frontmatter fields

| Field | Purpose | Rule file |
|---|---|---|
| `description` | One-line summary of the module; recommended on every module | — |
| `import` | Pull definitions, implementation reqs, and test reqs from import modules | `import-modules.md` |
| `requires` | Attach the module to the build chain of another root module | `requires-modules.md` |
| `exported_concepts` | Declare which of this module's concepts are visible to modules that `require` it | `exported-concepts.md` |
| `required_concepts` | Declare concepts an import module expects the importing module to define | `required-concepts.md` |

## Sections
- There are exactly four top-level section markers: `***definitions***`, `***implementation reqs***`, `***test reqs***`, and `***functional specs***`
- Each section appears **at most once** per file; all are optional (which ones are allowed depends on the module kind below)
- `***acceptance tests***` is **never a top-level section** — it appears only nested under a single functional spec (see `func-specs.md`)
- Write sections in canonical order: `***definitions***` → `***implementation reqs***` → `***test reqs***` → `***functional specs***`
  - Definitions come first because every concept must be defined before it is referenced
  - Functional specs come last because they are rendered incrementally and their nested acceptance tests close the file

## Module kinds
- A **root module** lives at the repository root and carries behavior: it contains `***functional specs***`
- To be renderable, a root module needs at least one functional spec plus the implementation reqs to build it — its own or from an `import`ed module (implementation reqs are not inherited through `requires`). A frontmatter-only file is a valid scaffold, but it cannot be rendered until a functional spec is added
- A **requires module** is a root module that is used by another root module via `requires` directive (see `requires-modules.md`)
- An **import module** provides shared content that other modules pull in via `import`: it contains only `***definitions***`, `***implementation reqs***`, and/or `***test reqs***` — never `***functional specs***`, never `requires` (see `import-modules.md`)

## Section ownership (where a fact lives)
- The renderer reads each kind of fact **only from its owning section** — a fact placed in the wrong section is silently ignored, not flagged
- Before writing any requirement, place it by content:
- To move facts that are already misplaced, or to split a bullet carrying several kinds of fact, use the `resolve-section-ownership` skill

| Content | Owning section | Rule file |
|---|---|---|
| Concepts (`:CamelCaseToken:`) | `***definitions***` | `definitions.md` |
| HOW the software is built — tech stack, architecture, coding standards — and **everything about `:UnitTests:`** | `***implementation reqs***` | `impl-reqs.md` |
| **Everything about `:ConformanceTests:`** — framework, run command, mocking and network policy | `***test reqs***` | `test-reqs.md` |
| WHAT the software does — observable, language-agnostic behavior | `***functional specs***` | `func-specs.md` |
| End-to-end workflow verification of one functional spec | nested `***acceptance tests***` | `func-specs.md` |

## Comments
- Lines beginning with `>` are ignored when rendering

```plain
> This is a comment in ***plain.
```

- Comments explain the specification to human authors — never use a comment to carry a requirement the renderer must implement

## Liquid templates
- `.plain` files are processed with [Liquid](https://shopify.github.io/liquid/) before parsing — the full Liquid syntax (variables, filters, conditionals, loops) is available in any section
- Expansion is **textual** and happens before the specification is interpreted — unlike `import`, which includes another module semantically (see `import-modules.md`)

```plain
{% assign max_tags = 3 %}

***functional specs***

- A :Widget: can be created with up to {{ max_tags }} tags.
{% if max_tags > 1 %}
- A :Widget: can have its tags listed.
{% endif %}
```

## Format

```plain
---
description: Command-line task manager.
import:
  - airplain
---

***definitions***

- :Task: is an activity tracked by the application.
  - Name (required)

- :TaskList: is the collection of all :Task: items. Initially empty.

***implementation reqs***

- :Implementation: keeps :TaskList: in memory.

***test reqs***

- :ConformanceTests: must not access the network.

***functional specs***

- A :Task: can be added to the :TaskList:.

- The :TaskList: is displayed.
```
