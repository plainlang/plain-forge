---
description: Terms used in .plain files, in plain-forge, and in plain-parser; use them as written
---

# Glossary

These are the names used across the rules, the skills, and the parser. Use them as written; do not coin synonyms.

- **Core spec** — a `.plain` file with functional specs, a root module. Test definitions do not live here.
- **Import module** — a `.plain` file in the template directory that other modules pull in with `import:`; definitions and reqs only (see `import-modules.md`).
- **Requires module** — a root module that another root module names under `requires:` to build on its generated code and functional specs (see `requires-modules.md`).
- **Functionality** — one functional spec in a module, identified by its func-id.
- **Func-id** — the slug in the `# <func-id>` heading of a functionality. Lowercase letters, digits, and hyphens; unique in the module; written as `<module>:<func-id>` when the module is needed. It needs no meaning (see `semantic-ids.md`).
- **Test plain file** — a `.plain` file that holds the scenarios of one functionality. Its frontmatter keys `module:` and `func_id:` bind it to that functionality; it has a `***conformance tests***` and an `***acceptance tests***` section. By convention it lives at `tests/<module>/<func_id>.plain`. Several may bind to one functionality; their scenarios are merged (see `test-plain-files.md`).
- **Scenario** — one test case in a test plain file: a `# <scenario-id>` heading followed by free text that says what is done and what result is expected. plain-forge writes plain English by default; `given:` / `when:` / `then:` is allowed. The renderer never writes a scenario.
- **Scenario-id** — the slug in a scenario heading. Same syntax as a func-id; unique across the scenarios of one functionality after merging. The generated test carries it.
- **Conformance scenario** — a scenario in `***conformance tests***`: the expected use of the functionality, its main path, with valid parameters, the expected caller, and the data present. The renderer implements every scenario of the test plain file and nothing else. A functionality is done only when all of its conformance tests pass. When conformance tests are enabled, every functionality has at least one.
- **Acceptance scenario** — a scenario in `***acceptance tests***`: use of the same functionality that is not expected, such as invalid parameters, wrong or missing authentication, missing data, or an unavailable dependency. It is rendered after the conformance tests of its functionality. A scenario that spans several functionalities is bound to the last one it exercises and sorted by the same rule.
- **Conformance test** — generated test code that implements one conformance scenario. It runs the implementation as a black box and is labelled with the scenario-id.
- **Acceptance test** — generated test code that implements one acceptance scenario, labelled with the scenario-id.
- **Old syntax** — functional specs written as `- ` bullets with no `# ` headings, and `***acceptance tests***` nested in a core spec. Not supported; `migrate-plain-syntax` converts a project.
