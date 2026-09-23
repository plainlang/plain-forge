---
name: add-feature
description: >-
  End-to-end feature addition on an existing ***plain project: runs a short feature-intent
  interview, then takes the confirmed request and, one question at a time, incrementally writes
  ***plain specs (concepts, implementation reqs, functional specs, test reqs,
  acceptance tests) to disk — asking, authoring, and reviewing per
  functionality — then closes with a plain-healthcheck gate. Use when the user
  wants to add a feature to an existing project. Not for bootstrapping a new
  project from scratch (use forge-plain) or for editing generated code (the
  .plain specs are the source of truth).
---

# Add Feature

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet.

`add-feature` is the continuous-loop counterpart of `forge-plain`. Where `forge-plain` bootstraps an entire project from scratch, `add-feature` adds a single feature to an **existing** set of `.plain` specs. It begins with a short intent phase, then runs the authoring loop scoped to one feature.

## Core loop: one question → one answer → write to disk

This loop starts after Phase 0. Each iteration is a single question followed by an immediate write:

1. **Ask** one focused question via `AskUserQuestion` — never bundle two. Shape it so any plausible answer maps directly to one writable snippet: a single behavior, concept, attribute, edge case, or constraint — not an open-ended design question. Bad shape: "How should the feature behave?" Good shape: "When the user submits an empty title, should the request be rejected with HTTP 400, accepted with a default title, or something else?" Offer concrete options plus a free-form catch-all whenever the answer space is predictable.
2. **Author immediately** — the moment the user answers, write the snippet to disk (see *2b* for which skill to route to). Do not wait for "enough" context; eager writes are the point. A snippet that is wrong on the first try is expected — the next question corrects it, and the user can read exactly where things stand after every step.
3. **Refine on the next question**, which often extends or corrects what was just written.

**One question per call, but drill as deep as the topic needs.** "One question" governs the `AskUserQuestion` call, not the topic. If an answer is vague or leaves real choices open, the *next* question drills into the same topic — another iteration of the loop — until it is concrete enough to write. Stopping early and writing on top of a vague answer is worse than one more focused follow-up.

**Fix contradictions in place.** If a later answer refines or contradicts a snippet already on disk, edit that snippet right now. Never leave stale intent on disk; surface a non-trivial change in the next question.

## Input

A feature request from the user — anything from a one-liner ("add dark mode") to a detailed
description. Phase 0 turns it into a confirmed feature-intent brief; Phase 2 sharpens the behavior
as it is authored.

## Phase 0 — Feature intent

Read `references/phase-0-intent.md`. Ask its five core questions one at a time, write nothing to
disk, summarize the answers as a feature-intent brief, and get explicit confirmation. Ask no more
than one focused clarification when an answer is too vague to summarize.

Carry the confirmed brief into every later phase. Before advancing, check the Phase 0 block in
`references/checklist.md` inline.

## Phase 1 — Scope

Keep this short. The goal is to know enough to ask the **very first** writable question — not to design the whole feature on paper.

1. **Read the confirmed feature-intent brief.** Identify which existing `.plain` file(s) the feature most likely belongs to.
2. **Read the target `.plain` file(s)**, following their `import` and `requires` chains, so the existing definitions, implementation reqs, functional specs, test reqs, and acceptance tests are in context. This is what lets Phase 2 recognize impact when it surfaces.
3. **Pick the target module with one question — only if it is genuinely ambiguous** which file to modify. Otherwise skip it and start authoring immediately.

End Phase 1 the moment the target file and a single concrete starter question are clear. Do **not** ask framing, scope, or multi-part design questions here.

## Phase 2 — One-question loop

A single repeating cycle: exactly one question, then an immediate write. The loop ends when the user says the feature is fully covered.

### 2a. Ask one question

Ask one writable question per `AskUserQuestion` call, targeting exactly one of:

- **Behavior** — a single trigger and its outcome.
- **A concept** — a new concept, or one single attribute of an existing one.
- **A single edge case** — one invalid input, empty state, or boundary value.
- **A single constraint** — one business rule, permission, ordering, or size limit.
- **Implementation guidance** — a policy that shapes how the functionality is built (retry, error handling, data format), or technology / a library / a pattern not already in the file or its imports.
- **Verification** — only when the *Conformance gate* below is satisfied: one concrete outcome that proves this functionality works.

Never bundle a second question into the prompt; never ask a question whose answer doesn't translate into a writable snippet on its own.

### 2b. Write immediately

Route each answer to the right edit skill — never hand-author a `***plain` section:

- **New concept** → `add-concept` (into `***definitions***`; define before any reference).
- **New functional spec** → `add-functional-spec`. It runs `analyze-if-func-spec-too-complex` and `analyze-func-specs` for you — let it. **Never hand-author functional specs.** If it reports the spec is too complex, ask the user a follow-up question to split it (the next loop iteration) — do not break it down alone.
- **New implementation req** → `add-implementation-requirement`. When the answer states HOW the functionality is built — a retry or error-handling policy, a data format, a library, an architectural pattern — and it is not already in the file or its imports.
- **New acceptance test** → `add-acceptance-test`, under the relevant functional spec. Only when the *Conformance gate* is satisfied and the answer describes a concrete verification.
- **New test req** → `add-test-requirement`. Only when conformance testing is configured and the answer changes how conformance tests are run.

If the answer contradicts or refines an earlier snippet, fix that snippet in place now (per *Fix contradictions in place* above).

### 2c. Handle conflicts just-in-time

If `add-functional-spec` (via its analyzers) reports a conflict, or the snippet just written would **break** (contradict, invalidate) or **augment** (change the meaning of, add behavior to) an existing concept / functional spec / implementation req / test req / acceptance test, the **next question** must be about that conflict. Show the exact existing snippet in the question and offer:

- **(a) keep** the existing spec — back out or narrow what was just written,
- **(b) augment** the existing spec — embed the proposed new wording in the question,
- **(c) replace** the existing spec.

Apply the choice the instant the user answers. If they augmented a concept, walk every spec that references it and update each in place, limited to the approved scope. Never silently rewrite prior intent.

### 2d. Decide what's next

Ask the user whether the feature is fully covered. Yes → Phase 3. No → return to 2a with the next single question.

### Conformance gate

Author `***test reqs***` and `***acceptance tests***` **only** when the project has a `config.yaml` with a valid `conformance-tests-script` entry pointing at an existing script in `test_scripts/`. Check the `config.yaml` that covers this module (multi-part projects may have several) and confirm the referenced script exists. If conformance testing is not configured, skip those two authoring paths entirely — concepts, functional specs, and implementation reqs are still authored normally.

## Phase 3 — Final review

Most checks already happened in the loop; this is a slim consistency pass whose final automated step is always `plain-healthcheck`.

1. Read the modified `.plain` file(s) in full.
2. Verify:
   - Every new concept is defined before use, with no circular references.
   - Chronological ordering is correct end-to-end — no spec depends on something that comes after it.
   - Functional specs are language-agnostic.
   - Every external interface is explicit (endpoint paths, methods, CLI args, formats).
   - Acceptance tests (if any) are consistent with their parent specs.
3. Present the final diff for the modified file(s) and get the user's approval.
4. If the user requests changes, drop **straight back into the one-question loop** — one question, one write, one fix at a time. Do not restart the loop from scratch.
5. **Run `plain-healthcheck`** — the last thing this skill does. It validates every `config.yaml` and statically checks every module, so a feature is never finished while the project would fail to render. If it returns `FAIL`, work through its numbered list (fixing only `.plain` files / `config.yaml` / scripts — never generated code) by dropping back into the loop, then re-run. Repeat until `PASS`. Only then tell the user the feature is ready and remind them to re-render `<module>.plain`.

## Next feature

After one feature is done, the user may describe the next. Start again from Phase 0 — a continuous
loop: **intent → scope → one-question loop → final review → intent → …**

## Error handling

- **A user answer contradicts prior specs** → edit the affected snippet in place immediately; surface a non-trivial change in the next question.
- **`add-functional-spec` reports "too complex"** → ask the user a follow-up question to split the spec (next loop iteration); never split it alone.
- **A conflict / break / augment surfaces** → make it the next question (2c) and resolve it before continuing.
- **`plain-healthcheck` returns `FAIL`** → do not declare the feature done; fix the listed `.plain` / `config.yaml` / script items via the loop and re-run until `PASS`.

## Validation checklist

Run the loop block in `references/checklist.md` on each iteration, and walk the whole list during Phase 3 before declaring the feature done. It is a self-audit of this workflow — never a substitute for it. A box only counts as met when the spec is on disk and explicitly approved; complete any unmet step before finishing.

## Question style

- Prefer short, direct sentences over compound or nested clauses.
- Use plain words over jargon when both convey the same meaning.
- One idea per sentence; split a comma-chained list of clauses into separate sentences.
- Never drop detail to simplify — keep every constraint, edge case, and option the user needs, splitting into more sentences instead.
