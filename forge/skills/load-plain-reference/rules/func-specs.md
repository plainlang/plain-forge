---
description: Rules for writing ***functional specs*** in .plain files
---

# Rules for writing `***functional specs***`

When writing or editing a `***functional specs***` section in a `.plain` file, always follow these rules:

## Shape
- Each functional spec, called a functionality, is a `# <func-id>` heading followed by its body; the func-id follows `semantic-ids.md`
- The body is free text that describes the behavior: prose, `- ` bullets, or any other shape the developer prefers; its first line states the behavior
- No body line starts with `# ` (that starts the next functionality) or with `***`
- The test scenarios of a functionality live in its test plain file, never in this section (see `test-plain-files.md`)

## Voice
- Write each functional spec as a **statement of fact** — present tense, indicative mood — describing what the software *is* or *does* once built, not as a command telling a developer what to build
- **Name a concrete subject**: an actor (`A :User: can …`), a named component or concept (`:PdfRenderer: lays out …`, `:Order: processing depends on …`), or the affected data in passive voice (`All :Resource: items are returned`)
- **Avoid the vague subject "The system …"** — it says nothing about *which* part does the work. Prefer the concrete component/concept, or passive voice with the affected concept as the subject
- **Never open a spec with an imperative** like "Implement …", "Add …", "Create …", "Show …", "Display …", "Build …" — those read as instructions, not specifications
- Do **not** use "should" / "should be able to" in a functional spec — that is requirement-modal voice; state the fact directly

BAD — imperative commands, or the vague "The system":

```plain
***functional specs***

# entry-point
Implement the entry point for :App:.

# show-task-list
The system shows :TaskList:.

# add-task
Add :Task:.
```

GOOD — statements of fact with concrete subjects:

```plain
***functional specs***

# entry-point
:App: has an entry point.

# show-task-list
The :TaskList: is displayed.

# add-task
A :User: can add a :Task:. Only valid :Task: items are added.
```

## Conciseness
- A functional spec that a human will not read is not reviewed, so every spec must be as short as its content allows — see `concise-specs.md`
- Cut anything obvious, any rationale, and every uncheckable adjective; keep every interface detail, boundary case, and disambiguation
- Shorten the wording, never the facts: the rules below always win over brevity

## Complexity limit
- The complexity limit is about breaking software into small, independently understandable behavior slices that people and AI can reason about, implement, and test reliably
- The current mechanism for enforcing the complexity limit is that each functional spec must imply a **maximum of 200 changed lines of code**.
- Smaller slices produce focused test failures, reduce hidden coupling and regression surface, and make review and incremental rendering more predictable
- If a spec is too large, use `break-down-func-spec` to split it into multiple smaller, independent specs
- Use `analyze-if-func-spec-too-complex` to verify before inserting
- Use `analyze-func-specs` to check a spec (or a batch of specs) against all relevant existing specs in a single batched call; use `resolve-spec-conflict` for each conflicting pair it reports

## First-spec bootstrap cost
- The first functional spec in a new root module carries implicit implementation cost even when its text describes little behavior
- The renderer may need to create the project structure, package metadata, framework configuration, entry point, initial source files, and unit-test infrastructure before implementing the behavior
- Count that bootstrap work toward the 200-changed-line limit; it is not free setup outside the spec
- Make the first spec the module's simplest useful, independently observable capability
- The first spec must still imply a testable outcome; setup alone is not a functional spec
- Prefer one minimal entry point or public operation with a deterministic result that can be invoked and verified
- Defer persistence, integrations, multiple interfaces, branching workflows, and cross-cutting behavior until later specs can build on the generated baseline
- This extra bootstrap cost applies when no previous implementation baseline exists; a module that continues from a `requires` module may already inherit the necessary scaffold

## Chronological ordering
- Specs are rendered incrementally, top to bottom
- The renderer has **no knowledge of future specs** — only previously rendered specs are in context
- A new spec can reference behavior from earlier specs but cannot assume anything about specs that come after it
- Functional specs from `requires` modules are treated as previous requirements — transitively, across the whole ancestor chain

## No conflicts
- The new spec must not contradict any existing functional spec
- Before adding, review all existing specs and verify compatibility
- If ambiguity exists, add explicit detail to eliminate any conflicting interpretation

## Language agnosticism
- Write in terms of behavior, concepts, and domain logic
- Avoid language-specific terminology: generics syntax, framework annotations, language-specific collection types, decorator syntax, base-class keywords, framings like "POJO" or "dataclass"
- General technical terms that are not language-specific are fine: null values, JSON types, HTTP status codes, REST endpoints, etc.
- **Naming concrete components is encouraged.** Functional specs can and should refer to concrete domain components, services, or entities (e.g., `:PaymentProcessor:`, `:UserRepository:`, `:DataConverter:`) and their operations (e.g., `:ChargeCard:`, `:FindById:`), pinning down their inputs, outputs, and error behavior. Those names are part of the public contract and survive a language switch. What they must **not** do is bake in how the contract is realized (`@staticmethod`, `class Foo extends Bar`, `List<T>`, `async def`, etc.)
- **Litmus test:** if the project switched from Python to Java (or vice versa), would the functional spec read correctly with only `***implementation reqs***` updated? If yes, the spec is language-agnostic. If the spec itself would need rewording, the construct belongs in implementation reqs.

## Disambiguation
- Each functional spec must be unambiguous — the renderer should have only one reasonable interpretation
- If the statement line is not enough to fully disambiguate the behavior, add `- ` bullets or sentences under it to add detail
- The detail clarifies the statement — it does not introduce separate functionality
- Even with the detail, the spec must still imply ≤ 200 lines of code

## Testability
- Every functional spec must describe behavior that can be verified through an observable interface
- State the triggering input or action and the deterministic outcome a test can observe
- Include relevant outputs, state changes, errors, or externally visible side effects
- Do not rely on generated implementation details as the only way to verify the behavior
- If a black-box conformance scenario cannot be written from the spec, make the behavior more explicit
- When conformance tests are enabled, every functionality has a test plain file with at least one conformance scenario (see `test-plain-files.md`); write it in the same step as the functional spec

## Deterministic interface
- Specs must be detailed enough that a developer can use the built software without reading the generated code
- All external interfaces must be explicit: REST endpoint paths and HTTP methods, CLI command names and arguments, file formats, message schemas, etc.
- Never leave interface details up to the renderer's discretion

## Encapsulation
- Functionality must be self-contained in the spec text
- `requires` modules only pass on functional specs and `exported_concepts` — never implementation reqs, so do not rely on implementation reqs to convey behavior
- Behavior that downstream modules need must be expressed in functional specs, not elsewhere

## Test scenarios live in test plain files
- A spec plain file never holds a `***acceptance tests***` section, nested or top-level
- Conformance and acceptance scenarios for a functionality go into its test plain file, by convention `tests/<module>/<func-id>.plain`, written with `add-test-scenarios` (see `test-plain-files.md`)
- A functional spec and its test plain file change together: a spec edit without a scenario review is not finished

## Format

```plain
***functional specs***

# entry-point
:App: has an entry point.

# add-task
A :User: can add a :Task:. Only valid :Task: items are added.

# send-message
A :User: can send a :Message: to a :Conversation:.
- A :Message: must have non-empty content.
- The :Message: is appended to the end of the :Conversation:.
- All :Participant: members of the :Conversation: can see the new :Message:.
```
