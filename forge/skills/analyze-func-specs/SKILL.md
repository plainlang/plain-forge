---
name: analyze-func-specs
description: >-
  Analyze a batch of functional specs from a ***plain spec file to determine
  which pairs conflict. Replaces the pair-by-pair `analyze-2-func-specs` flow
  when a caller wants to check many specs at once (e.g. a new spec against
  every existing spec, or a freshly inserted batch against itself).
---

# Analyze Functional Specs

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

Before reading or editing any `.plain` file, check it for the old syntax (see *Old syntax* in `module-structure.md`): a flush-left `- ` bullet in `***functional specs***`, an `***acceptance tests***` section in a core spec, or `requires:` / `import:` in the frontmatter. If any is present, stop, name the file and the marker, and point the user to `migrate-plain-syntax`; do not edit a file in the old syntax.

## Input

A **set of two or more functional specs** to check against each other. Callers typically supply one of:

- A whole `***functional specs***` section to self-check.
- A new spec (or batch of new specs) **plus** the existing specs from the same file and any `base` modules.
- An explicit list of spec snippets the user wants compared.

Each spec must be identifiable. Use its func-id (`<module>:<func-id>` when the batch spans modules). A draft that has no func-id yet gets a **stable identifier** in order of appearance: `S1`, `S2`, `S3`, …. Use those identifiers in the output. If the caller provided its own labels or quoted snippets, use those instead and keep them verbatim.

The skill also needs the `***definitions***` section (and any imported definitions) so referenced `:Concepts:` can be resolved.

## Workflow

1. **Read all input specs and the relevant `***definitions***`** so every `:Concept:` is understood.
2. **Establish chronological order** across the batch. Earlier specs are considered to have been rendered first; later specs are evaluated with the earlier ones in context. If the caller already provided an order, preserve it.
3. **Generate the pair list.** Enumerate every unordered pair `(Sᵢ, Sⱼ)` with `i < j`. Skip pairs where the two specs share no `:Concept:` and no overlapping subject — they are trivially compatible and listing them adds noise.
4. **Run the conflict analysis below on each remaining pair.** Use the same checklist that the legacy `analyze-2-func-specs` skill used, but apply it pair by pair across the batch in a single pass — do not require the caller to invoke the analyzer once per pair.
5. **Record every CONFLICTING pair.** Compatible pairs are not listed individually; only the conflicts are emitted.
6. **Output the verdict** in the format below. No reasoning, no category labels, no resolution suggestions.

## Conflict Analysis Checklist (applied per pair)

Work through each question for the pair under inspection. If any answer is "yes", that pair is CONFLICTING.

### 1. Direct Contradiction

Do the two specs make mutually exclusive assertions about the same behavior?

```
Spec A: :Resource: items are returned sorted by name in ascending order.
Spec B: :Resource: items are returned sorted by creation date in descending order.

Verdict: CONFLICTING — both define the sort order for the same response,
but specify different fields and directions. A single implementation cannot
satisfy both unless scoped to different contexts.
```

### 2. State or Data Conflict

Does one spec set a state or value that the other spec assumes is different?

```
Spec A: :TaskList: is initially empty.
Spec B: :TaskList: contains a default "Welcome" :Task: on first load.

Verdict: CONFLICTING — both define the initial state of :TaskList: differently.
```

### 3. Behavioral Override

Does the later spec silently replace behavior established by the earlier spec without acknowledging it?

```
Spec A: :User: credentials are validated using an API key.
Spec B: :User: credentials are validated using OAuth 2.0.

Verdict: CONFLICTING — both define the authentication mechanism but pick
different approaches. The later spec overrides the earlier one.
```

### 4. Scope Ambiguity

Are the two specs ambiguous enough that a renderer could interpret them as conflicting, even if the user intends them to be complementary?

```
Spec A: All :Resource: items are returned.
Spec B: Only active :Resource: items are returned.

Verdict: CONFLICTING (ambiguous) — "all" vs "only active" appear contradictory.
Could be resolved by scoping each to different conditions (e.g., filtered vs unfiltered).
```

### 5. Shared Concept, Different Constraints

Do both specs impose constraints on the same `:Concept:` that cannot coexist?

```
Spec A: :BatchSize: is 100 items.
Spec B: :BatchSize: is 50 items for :Resource: types with attachments.

Verdict: COMPATIBLE — Spec B adds a conditional refinement, not a contradiction.
```

## Output Format

Emit exactly one of the two shapes below, with no surrounding text, explanation, category label, or resolution suggestion.

If **no pair** is conflicting:

```
COMPATIBLE
```

If **one or more pairs** are conflicting, emit `CONFLICTING` followed by one line per conflicting pair, in `Sᵢ x Sⱼ` form (using the identifiers from the input, with `i < j`), sorted lexicographically:

```
CONFLICTING
S1 x S4
S2 x S3
S3 x S5
```

Rules for the output:

- Do **not** list compatible pairs.
- Do **not** include reasoning, checklist categories, or fixes — the caller decides what to do with each conflict (typically: invoke `resolve-spec-conflict` on each pair).
- If the input contained fewer than two specs, emit `COMPATIBLE` (nothing to compare).
- Identifiers must match exactly what the caller provided (or the `S1`, `S2`, … fallback assigned in step 1).

The internal pairwise analysis informs the verdict but must not appear in the output.
