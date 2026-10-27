---
name: add-test-scenarios
description: >-
  Write or update the test plain file of one functionality
  (by convention tests/<module>/<func-id>.plain): conformance scenarios for its expected use
  and, when the user asks for them, acceptance scenarios for its unexpected use, in plain English. Use after
  a functional spec is added or changed, when a functionality has no
  conformance scenario, or when the user asks for a test scenario.
---

# Add Test Scenarios

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## What this skill writes

One test plain file per functionality, by convention at `tests/<module>/<func-id>.plain`, with the frontmatter keys `module:` and `func_id:` and the two sections `***conformance tests***` and `***acceptance tests***`. Every scenario is a `# <scenario-id>` heading, one plain-English statement line, and `- ` bullets when the line is not enough. Conformance scenarios are written with the spec; acceptance scenarios only when the user asks for them. The renderer generates one test per scenario and nothing else, so the scenarios in this file are the only tests the functionality gets.

## When to Use

- `add-functional-spec` or `add-functional-specs` inserted a functionality — those skills invoke this one for each new functionality.
- A functional spec changed (edit, split, conflict resolution, move) and its scenarios must be brought back in step.
- A functionality has no test plain file while conformance tests are enabled, or its `***conformance tests***` section is still empty.
- The user asks for a conformance or acceptance scenario.

## Conformance gate

Conformance tests are enabled for a module when the `config.yaml` that governs it has a `conformance-tests-script` entry pointing at an existing script. When they are enabled, every functionality must end up with a test plain file and should end up with at least one conformance scenario; a file whose `***conformance tests***` section is empty is valid and holds the comment `> add conformance test scenarios here`. When they are not enabled, write a test plain file only if the user asks for one, and say that conformance tests are off for the module.

## Workflow

1. **Identify the functionality.** Take the module name and func-id from the caller or the user. If the user points at a spec by its text, find its `# <func-id>` heading.
2. **Read the context.** Read the functional spec (heading and body), the `***definitions***` the module sees (its own, its `import` modules, and the `exported_concepts` of its `requires` modules), the `***test reqs***`, and the functional specs that come before this one, because a scenario may rely on behavior they established.
3. **Locate or create the test plain file.** Find every `.plain` file whose frontmatter binds to the pair `(module, func_id)`; by convention it is `tests/<module>/<func-id>.plain`, but only the frontmatter decides. Read every file found, so scenario-ids stay unique across the merged set. If none exists, create the file at the conventional path with the frontmatter and both sections. When the user asks for the file without scenarios, skip steps 4 to 7.
4. **List and sort the outcomes the spec states.** Walk the statement line and every clarification bullet. Write down the main path and each boundary, validation, and error case the spec names. Conformance scenarios cover the expected use (the main path and its valid variants). Use that is not expected (invalid parameters, wrong or missing authentication, missing data, an unavailable dependency) becomes an acceptance scenario only when the user asks for it; never draft one on your own. Do not add an outcome the spec does not state: a scenario may not extend the spec. If a needed outcome is missing from the spec, ask the user one question and route the answer into the functional spec through `add-functional-spec` (or an inline edit of the clarification bullets) before writing the scenario.
5. **Draft one conformance scenario per expected-use outcome, and the acceptance scenarios the user asked for.** Give each a scenario-id per `semantic-ids.md` (short slug, unique for this functionality). Write the body in plain English:
   - One statement line: a sentence that names the action and the expected result, with concrete values.
   - When that line is not enough, `- ` bullets, in order: the state before the action, the one action under test, and each observable result, one fact per bullet.
   - `given:` / `when:` / `then:` lists are allowed when the user asks for them; otherwise plain English, and one shape per project.
   Test the functionality through the interface the spec names, as a black box. A scenario may use earlier functionalities for its setup; a scenario that spans several functionalities is bound to the last one it exercises and is written only when the user asks for it.
6. **Check what the test can cause.** An acceptance scenario the user asked for that needs a dependency to fail (a backend that does not respond, a database that is unavailable) is written only when `***test reqs***` let the test cause that failure, for example with a local mock of that dependency. Otherwise ask the user one question: add such a test req, or leave the scenario out.
7. **Run the review pass** from `concise-specs.md` over every scenario: no narration, no rationale, no step a reader would assume, concrete values, plain words.
8. **Write the file and read it again.** Confirm the frontmatter keys, the section order, and that no body line starts with `# ` or `***`. When `***conformance tests***` holds no scenario, write the comment `> add conformance test scenarios here` in it and nothing else.
9. **Review with the user** when running inside `forge-plain` or `add-feature`: show the scenarios as the snippet for that loop iteration and apply the response before moving on.

## Updating existing scenarios

- **The spec changed.** Compare every scenario with the new spec text. Remove or rewrite a scenario that no longer follows from the spec; add a scenario for every new outcome. Keep the scenario-id of a scenario whose meaning is unchanged, because the generated test carries it.
- **The functionality was split.** Each new functionality gets its own test plain file; move each scenario to the functionality it tests and write new scenarios for outcomes that have none.
- **The func-id was renamed.** Rename `func_id:` in every test plain file bound to it and move the file to the new conventional path.
- **The functionality was deleted.** Delete its test plain file; confirm with the user first when it holds hand-written scenarios.
- **The functionality moved to another module.** Update `module:` and move the file to the new conventional path.

## Rules

- A scenario is a direct consequence of the functional spec: it does not contradict, narrow, or extend it.
- The kind of use decides the section, not the number of functionalities a scenario touches: expected use under `***conformance tests***`, everything else under `***acceptance tests***`.
- Acceptance scenarios are written only on the user's explicit instruction; conformance scenarios come with the spec.
- Scenarios are language-agnostic and black box: no function, class, or file of the implementation is named.
- Values that matter to the check are concrete (`named "Buy milk"`, `returns 404`); descriptive values (`a valid name`) are not checkable.
- One scenario per distinct outcome; the same outcome is never written twice in different words.
- Framework, run command, and network policy belong in `***test reqs***`, never in a scenario.
- No `***acceptance tests***` section is ever written into a spec plain file.

## Format

```plain
---
module: task-manager
func_id: add-task
---

***conformance tests***

# add-valid-task
Adding a :Task: named "Buy milk" to an empty :TaskList: shows one :Task: named "Buy milk".

***acceptance tests***

# reject-short-name
Adding a :Task: named "Go" to an empty :TaskList: is rejected.
- :App: shows the error "Name must be at least 3 characters".
- :TaskList: stays empty.
```

## Validation Checklist

- [ ] The file's `module:` and `func_id:` name an existing functionality
- [ ] `***conformance tests***` comes first, `***acceptance tests***` second; both sections exist
- [ ] `***conformance tests***` holds at least one scenario, or only the comment `> add conformance test scenarios here`
- [ ] Every expected-use outcome the functional spec states has one conformance scenario; no scenario states an outcome the spec does not
- [ ] No unexpected-use scenario under `***conformance tests***`, no expected-use scenario under `***acceptance tests***`
- [ ] Acceptance scenarios only where the user asked for them
- [ ] Every scenario is a `# <scenario-id>` heading, a plain-English statement line, bullets when needed, and concrete values
- [ ] Scenario-ids follow `semantic-ids.md` and are unique across every test plain file bound to this functionality
- [ ] Scenarios are black box and language-agnostic
- [ ] Trimmed per `concise-specs.md`
- [ ] No `***acceptance tests***` section was written into the spec plain file
