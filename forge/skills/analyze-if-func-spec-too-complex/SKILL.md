---
name: analyze-if-func-spec-too-complex
description: >-
  Analyze a functional spec to determine if it is too complex for the renderer.
  A spec is too complex if it would produce more than 200 lines of code changes.
  Use after drafting a new functional spec (during `add-functional-spec`, or
  per spec during `add-functional-specs`) to verify it fits within the
  complexity limit before inserting it.
---

# Analyze If Functional Spec Is Too Complex

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## Why This Matters

The renderer enforces a hard complexity limit: each functional spec must imply a **maximum of 200 changed lines of code**. If a spec exceeds this, the renderer rejects it with "Functional spec too complex!" and the spec must be broken down. Catching this before insertion saves a failed render cycle.

## Input

A drafted functional spec (not yet inserted into the file), plus the full context of the `.plain` file it will be added to — definitions, implementation reqs, and existing functional specs.

## Workflow

1. **Read the full `.plain` file** (and any `requires`/`import` modules) to understand the current codebase context — what already exists and what the new spec builds on.
2. **Read the drafted functional spec** carefully.
3. **Run the complexity analysis** using the checklist below.
4. **Output the verdict and nothing else** — either `ACCEPTABLE` or `TOO COMPLEX`. No reasoning, no LOC estimate, no breakdown.

## Complexity Analysis Checklist

Work through each indicator. A single "yes" does not automatically mean the spec is too complex, but multiple "yes" answers are a strong signal.

### 0. First-Spec Bootstrap Cost

Is this the first functional spec in a new root module with no implementation baseline supplied by
`requires`? If so, include the implicit cost of creating the project structure, package metadata,
framework configuration, entry point, initial source files, and unit-test infrastructure.

The first spec must be substantially simpler than a later spec. It should expose one minimal,
deterministic capability that can be invoked and tested. Setup without an observable result is not
acceptable, but combining bootstrap work with persistence, integrations, multiple interfaces,
branching workflows, or cross-cutting behavior is a strong `TOO COMPLEX` signal.

### 1. Number of Distinct Behaviors

Does the spec describe more than one independently testable behavior?

Too complex:
```plain
***functional specs***

# manage-tasks
A :User: can create, edit, delete, and archive :Task: items, with validation on all fields and confirmation dialogs for destructive actions.
```

Acceptable (one behavior each):
```plain
***functional specs***

# create-task
A :User: can create :Task:. Only valid :Task: items can be added.

# edit-task
A :User: can edit :Task:.

# delete-task
A :User: can delete :Task:.

# archive-task
A :User: can archive :Task:.

```

### 2. Number of Concepts Introduced or Modified

Does the spec require introducing new data structures, UI components, API endpoints, or other constructs that don't already exist? Count them.

- 0–1 new constructs → likely fine
- 2–3 new constructs → borderline, examine closely
- 4+ new constructs → almost certainly too complex

### 3. Branching Logic and Conditions

Does the spec describe multiple conditional paths, modes, or special cases?


Too complex:
```plain
***functional specs***

# process-order
:Order: processing depends on :OrderType:. Standard orders are validated and stored. Express orders skip validation and are queued for immediate dispatch. Bulk orders are split into sub-orders of 100 items each, validated individually, and processed in parallel with progress tracking.
```

Acceptable (separate the modes):
```plain
***functional specs***

# process-standard-order
A standard :Order: is validated and stored.

# process-express-order
An express :Order: is queued for immediate dispatch without validation.

# split-bulk-order
A bulk :Order: is split into sub-orders of 100 items each.
  - Each sub-order is processed individually.
```

### 4. Cross-Cutting Concerns

Does the spec bundle core functionality with cross-cutting concerns like error handling, logging, retry logic, pagination, or caching?

Too complex:
```plain
***functional specs***

# fetch-resources
:Resource: items are fetched from the external API with pagination support, retry on transient errors with exponential backoff, caching for 5 minutes, and logging of all API calls.
```

Acceptable (separate concerns):
```plain
***functional specs***
# fetch-resources
:Resource: items are fetched from the external API.

# fetch-resources-paged
:Resource: items are fetched from the external API in pages.

# retry-resource-fetch
Fetching :Resource: items is retried on transient errors using exponential backoff.
```

### 5. UI Complexity

Does the spec describe a complete screen or page with multiple interactive elements, layouts, and state transitions?

Too complex:
```plain
***functional specs***

# dashboard
The dashboard shows :User: profile, recent :Task: items in a sortable table, a notification bell with unread count, and a sidebar with navigation links that highlights the active page.
```

Acceptable (build incrementally):
```plain
***functional specs***

# dashboard-page
A dashboard page is shown for :User:.

# dashboard-recent-tasks
Recent :Task: items are shown in a sortable table on the dashboard.

# dashboard-notifications
A notification indicator with the unread count is shown on the dashboard.
```

### 6. Data Transformation Complexity

Does the spec involve complex data mapping, aggregation, or transformation across multiple entities?

- Simple field mapping or filtering → likely fine
- Multi-step transformations, joins across entities, or aggregations → likely too complex

### 7. Implied Technical Component

Does the spec imply building a substantial technical component — an engine, parser, scheduler, layout algorithm, state machine, or sync mechanism — **in addition to** the behavior it describes? A component is not a free primitive: code must be generated for it too, so it counts toward the 200-LOC budget and must be evaluated as part of the estimate. A spec that needs a component **and** wires up behavior on top of it is really two bodies of code in one spec — a strong "too complex" signal. Count the component's implementation, not just the glue that calls it.

Too complex (builds the component and uses it in one spec):
```plain
***functional specs***

# export-report-pdf
A :Report: is exported to PDF, laying out multi-page tables with repeating headers and page numbers, and charts rendered from :Report: data.
```

Acceptable (component in its own spec, then referenced):
```plain
***functional specs***

# pdf-renderer-tables
:PdfRenderer: lays out multi-page tables from structured content.
  - Table headers repeat at the top of each page.
  - Each page shows its page number.

# export-report-pdf
A :Report: is exported to PDF using :PdfRenderer:, embedding charts rendered from :Report: data.
```

When this indicator fires, the fix is `break-down-func-spec` Strategy 6 — extract the component into its own earlier spec and reference it.

### 8. Rough LOC Estimation

Mentally estimate the implementation. Consider:
- New files that need to be created
- New functions/methods
- Code for any implied technical component (engine, parser, algorithm), not just the glue that uses it
- Data model changes (schema, migrations, types)
- UI components (if applicable)
- Test setup and assertions (unit tests are auto-generated alongside)
- For the first spec in a new root module, all project and test scaffold implied by implementation requirements
- Error handling paths
- Import statements and boilerplate

If the estimate exceeds ~150 LOC, the spec is at high risk of being too complex (leave headroom for the renderer to add necessary boilerplate).

## Output Format

The skill emits exactly one of these two strings, with no surrounding text, explanation, estimate, or breakdown:

```
ACCEPTABLE
```

or

```
TOO COMPLEX
```

The internal analysis (checklist, LOC estimation, reasoning) informs the verdict but must not appear in the output. The caller decides what to do with the result.

## Integration with add-functional-spec / add-functional-specs

This skill is called during step 3 of the `add-functional-spec` workflow (or per spec during `add-functional-specs`), after drafting a spec but **before** inserting it into the file. The caller acts on the one-word verdict:

- **ACCEPTABLE** — proceed to insert the spec.
- **TOO COMPLEX** — invoke `break-down-func-spec` to produce smaller specs, then insert each one individually (running conflict checks on each).
