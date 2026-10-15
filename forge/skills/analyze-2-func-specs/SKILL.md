---
name: analyze-2-func-specs
description: >-
  Analyze two functional specs from a ***plain spec file to determine if they
  conflict. Use when the user wants to check whether two specific functional
  requirements are compatible, or when debugging a suspected conflict between
  two specs.
---

# Analyze Two Functional Specs

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## Input

Two functional specs from a `.plain` file (or across `base` modules). The user provides them directly or points to them by location in a file.

## Workflow

1. **Read both functional specs** and the `***definitions***` section so all referenced `:Concepts:` are understood.
2. **Determine chronological order** — which spec comes first? The earlier spec was rendered first and the later spec was rendered with the earlier one in context.
3. **Run the conflict analysis** using the checklist below.
4. **Output the verdict and nothing else** — either `COMPATIBLE` or `CONFLICTING`. No reasoning, no category labels, no resolution suggestions.

## Conflict Analysis Checklist

Work through each question. If any answer is "yes", the specs likely conflict.

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

The skill emits exactly one of these two strings, with no surrounding text, explanation, category label, or resolution suggestion:

```
COMPATIBLE
```

or

```
CONFLICTING
```

The internal analysis (checklist, chronological reasoning) informs the verdict but must not appear in the output. The caller decides what to do with the result — typically: act on `COMPATIBLE` by proceeding, or invoke `resolve-spec-conflict` on `CONFLICTING` to produce the actual fix.
