---
description: Syntax and authoring rules for test plain files, which hold the conformance and acceptance scenarios of one functionality
---

# Rules for test plain files

A test plain file holds the test scenarios of one functionality. The renderer generates conformance and acceptance tests from these scenarios and from nothing else: it never invents a scenario. Scenarios are written by people or by plain-forge at authoring time and are reviewed like any other spec line. Always follow these rules when creating or editing one.

## File skeleton
- A test plain file is a `.plain` file with YAML frontmatter and two sections, in this order: `***conformance tests***`, then `***acceptance tests***`
- Both sections are required; `***acceptance tests***` may be empty
- The frontmatter has exactly two keys, both required:
  - `module:` the name of the module that holds the functionality (the core spec's file name without `.plain`)
  - `func_id:` the func-id of the functionality (see `semantic-ids.md`)
- The pair `(module, func_id)` must name a functionality that exists; a pair with no match is an error
- A test plain file has no `***definitions***`, `***implementation reqs***`, `***test reqs***`, or `***functional specs***`
- Comment lines starting with `>` are allowed, as in a core spec

## Location
- By convention a test plain file lives at `tests/<module>/<func_id>.plain`, with `tests/` next to the core spec
- The location and the file name are convention only: the renderer discovers test plain files by reading the frontmatter of every `.plain` file under its test folders
- plain-forge always writes to the conventional path, one file per functionality
- More than one test plain file may bind to the same functionality; their scenarios are merged, and scenario-ids must be unique across the merged set. Hand-written files may use this; plain-forge keeps one file per functionality

## Scenarios
- A scenario is a `# <scenario-id>` heading (see `semantic-ids.md`) followed by free text that says what is done and what result is expected
- A scenario body line may be prose, a `- ` bullet, or any other text, as long as it does not start with `# ` (that starts a new scenario) or with `***`
- A scenario may reference every concept visible to its module: its own definitions, its `import` modules, and the `exported_concepts` of its `requires` modules. It defines no concepts
- Scenarios are language-agnostic: they describe behavior through the observable interface (CLI, HTTP, files, UI) and never name a function, class, or file of the implementation
- A scenario tests the functionality as a black box; the generated test never imports the implementation's internals
- A scenario is a direct consequence of the functional spec: it does not contradict, narrow, or extend the behavior the spec states
- Each scenario states one concrete, checkable outcome; "works correctly" is not an outcome
- Scenario text follows `concise-specs.md`: no narration, no rationale, no step a reader would assume

## The shape plain-forge writes
- plain-forge writes every scenario in plain English, with the same shape as a functionality: one statement line, then `- ` bullets indented by two spaces when the line is not enough; hand-written scenarios may use any shape
- The statement line is one sentence that names the action and the expected result (`Adding a :Task: named "Go" to an empty :TaskList: is rejected.`)
- The bullets list, in order, the state before the action, the action, and each observable result that the statement line does not already carry, one fact per bullet
- `given:` / `when:` / `then:` lists or Gherkin steps are allowed when the user asks for them; keep one shape per project
- Values that matter to the check are concrete (`named "Buy milk"`, `exits with status 0`), never descriptive (`a valid name`)

## Conformance scenarios
- `***conformance tests***` holds the scenarios of the expected use of the functionality: its main path, with valid parameters, the expected caller, and the data present. For a REST endpoint: what it returns when the caller is authenticated, the data exists, and the parameters are valid
- These scenarios gate the functionality: it is done only when every conformance scenario passes
- When conformance tests are enabled for the module (its `config.yaml` has a `conformance-tests-script`), every functionality has at least one conformance scenario; an empty section is an error
- Cover the main path first, then each variant of expected use the functional spec states (another valid input shape, an optional parameter); stop when every expected behavior has one scenario
- Do not write the same scenario twice in different words; one scenario per distinct outcome

## Acceptance scenarios
- `***acceptance tests***` holds the scenarios of use that is not expected: invalid parameters, wrong or missing authentication, missing data, an unavailable dependency. For the same REST endpoint: what it returns when authentication is wrong or the parameters are invalid
- Write one for every error and boundary outcome the functional spec states; the section may be empty when the spec states none
- An acceptance scenario is rendered after the conformance tests of its functionality pass
- A scenario that needs a dependency to fail (a backend that does not respond, a database that is unavailable) is written only when `***test reqs***` let the test cause that failure, for example with a local mock of that dependency; otherwise ask the user before writing it
- The kind of use decides the section, not the number of functionalities the scenario touches (see *Scenarios across functionalities*)

## Scenarios across functionalities
- A scenario may use functionalities rendered before the one it is bound to, for its setup or as steps of a longer path
- Such a scenario is bound to the last functionality it exercises, because the earlier ones must exist when it runs
- It goes under `***conformance tests***` when every step is expected use, and under `***acceptance tests***` when any step is not; plain-forge writes one only when the user asks for it

## Keeping test plain files in step with functional specs
- Every change to a functional spec is followed by a review of its test plain file: scenarios that no longer follow from the spec are removed or rewritten, and new behavior gets a scenario
- When a functionality is split, each new functionality gets its own test plain file; each scenario moves to the functionality it tests
- When a functionality is deleted, its test plain file is deleted
- When a functionality moves to another module, its test plain file moves to that module's folder and its `module:` key is updated
- When a func-id is renamed, `func_id:` is renamed in every test plain file bound to it and the file moves to the new conventional path

## Relation to `***test reqs***`
- `***test reqs***` of the module say how `:ConformanceTests:` are built and run (framework, command, network policy); the scenarios say what they check
- A fact about the framework or the run command never goes into a scenario, and a scenario never goes into `***test reqs***`

## Format

```plain
---
module: task-manager
func_id: add-task
---

***conformance tests***

# add-valid-task
Adding a :Task: named "Buy milk" to an empty :TaskList: shows one :Task: named "Buy milk".

# add-second-task
Adding a :Task: named "Call mom" to a :TaskList: that holds "Buy milk" shows two :Task: items, "Buy milk" first.

***acceptance tests***

# reject-short-name
Adding a :Task: named "Go" to an empty :TaskList: is rejected.
  - :App: shows the error "Name must be at least 3 characters".
  - :TaskList: stays empty.
```
