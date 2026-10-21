---
description: Conciseness and plain-language rules that keep .plain specs reviewable by a human
---

# Rules for keeping `.plain` specs concise

These rules apply to every section, to concept explanations, and to acceptance tests. `concise-specs-examples.md` holds a worked BAD to GOOD pair for each failure mode named here, and `concise-specs-integration-examples.md` covers the failure modes specific to integration specs.

## Why this matters

- A spec is the source of truth, so a human has to be able to review it
- A long, dense, or ornate spec is skipped rather than reviewed — an unreviewed spec is an unverified spec, however correct it happens to be
- Length is not a proxy for rigor: a spec earns trust by being checkable, not by being thorough-looking
- Conciseness is about removing what carries no information, never about removing required detail — the deterministic-interface, disambiguation, and testability rules always win (see `func-specs.md`)

## Do not write the obvious

Delete any line a competent reader would already assume. Ask of every line: *if this were missing, would anything be built differently?* If not, cut it.

Do not write:

- Restatements of a concept's own name (`:UserEmail: is the email address of a :User:.` adds nothing beyond what `definitions.md` already requires the concept to carry)
- Universal software defaults: that invalid input is rejected, that errors are reported, that data is saved when saving is the point of the operation
- Rationale, motivation, benefits, or background — the spec states what is, not why it was chosen
- Standard behavior of a technology already named in `***implementation reqs***` (an HTTP framework parses HTTP; a database driver opens connections)
- Restatements of a nearby bullet in different words, or of anything already stated in an `import`ed or `require`d module
- Anything about work the spec is not about ("no changes to the existing UI")
- Meta-commentary about the spec itself ("this spec is intentionally small", "as described above")

Worked pairs for every item above — padding, rationale, defaults, technology behavior,
meta-commentary, and duplication of an `import` — are in `concise-specs-examples.md`.

## Use plain words

- Prefer the shortest word that is still exact; a technical term needs to be exact, an elaborate one is not
- Write short sentences: one clause plus, at most, one qualifier
- Use the same word for the same thing every time — synonym variety reads as two different things
- Do not use adverbs and adjectives that no test can check: `robust`, `seamless`, `efficient`, `scalable`, `comprehensive`, `modern`, `properly`, `gracefully`, `as appropriate`, `where applicable`, `best practices`. Either state the checkable fact (`a response is returned within 200 ms`) or delete the word
- Do not hedge: `should ideally`, `may optionally`, `typically`, `generally`, `if possible`. A spec states one behavior; a hedge tells the renderer to guess

| Do not write | Write |
|---|---|
| utilize, leverage | use |
| facilitate, enable the ability to | let, or name the action |
| in order to | to |
| prior to / subsequent to | before / after |
| in the event that | if |
| is responsible for handling | handles |
| performs the validation of | validates |
| a plurality of | several, or a number |
| terminate, initiate | stop, start |
| functionality for X | X |

## Keep the shape small

- One statement per bullet, one bullet per fact (see `bullet-continuation.md`)
- Nest a sub-bullet only to remove a real ambiguity; a sub-bullet that merely elaborates is filler
- Consecutive specs that share a subject are usually one spec: if a top-level bullet only tells part of the story of one operation, merge the set, lead with the operation's result, and demote the steps and failure modes to sub-bullets (see *One operation fragmented into several specs* in `concise-specs-integration-examples.md`)
- Tables, prose paragraphs, and code blocks do not belong in a section; external artifacts are linked from `resources/` (see `linked-resources.md`)
- A bullet that answers more than one of *what is it*, *what does it do*, *how is it built*, and *how is it tested* is not one fact — split it across the sections that own those facts, which reads better and is the only way the renderer sees each part (see `module-structure.md`, and *Split one crowded bullet across its owning sections* in `concise-specs-examples.md`)

## Terse is not a defect

A finished spec usually reads as abrupt: clipped bullets, no connective tissue, no lead-ins. That is the intended shape, not something to smooth out afterwards.

- Add a word only to make a line correct, unambiguous, or checkable — never to make it read better
- Do not merge short bullets into one sentence for rhythm, and do not open a section or a bullet with a lead-in
- The bar is the other rules — correct, intent intact, reviewable, testable. A spec that clears them is finished however clipped it sounds
- Filler is not neutral: the renderer reads every line as a requirement, so a line written for flow can invent one

## Review pass before writing to disk

Read the drafted lines once more and apply, in order:

1. **The deletion test** — cut every line whose removal would change nothing about what gets built
2. **The word test** — replace every ornate word with a plain one, and delete every uncheckable adjective, adverb, and hedge
3. **The duplication test** — cut anything already stated in this file, an `import`, or a `requires` chain
4. **The read-aloud test** — a line you cannot read aloud in one breath is either two facts or one padded one

If a cut would remove an interface detail, a boundary case, or a disambiguation, keep the fact and shorten the wording instead — see *Do not over-cut* in `concise-specs-examples.md` for what a spec cut past its content looks like.
