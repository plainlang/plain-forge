---
name: break-down-func-spec
description: >-
  Break down a functional spec that is too complex into smaller specs that
  each imply ≤ 200 lines of code. Use when analyze-if-func-spec-too-complex
  flags a spec as TOO COMPLEX, or when a spec is suspected of being too large.
---

# Break Down Functional Spec

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

Before reading or editing any `.plain` file, check it for the old syntax (see *Old syntax* in `module-structure.md`): a top-level `- ` bullet in `***functional specs***`, an `***acceptance tests***` section in a core spec, or `requires:` / `import:` in the frontmatter. If any is present, stop, name the file and the marker, and point the user to `migrate-plain-syntax`; do not edit a file in the old syntax.

## When to Use

- `analyze-if-func-spec-too-complex` flagged a spec as TOO COMPLEX.
- A spec is suspected of exceeding the 200 LOC limit and needs to be split preemptively.
- A spec bundles multiple behaviors, constructs, or concerns that should be separated.

## Input

The functional spec to break down, plus the full `.plain` file it belongs to.

## Workflow

1. **Read the full `.plain` file** — definitions, implementation reqs, and all functional specs (including `base` modules) to understand context.
2. **Identify the spec to break down** — the one flagged as too complex or pointed to by the user.
3. **Analyze why it is too complex** — use the indicators from `analyze-if-func-spec-too-complex`:
   - Multiple distinct behaviors bundled together?
   - Too many new constructs introduced at once?
   - Complex branching logic or conditional paths?
   - Cross-cutting concerns mixed with core functionality?
   - A full UI screen described in one spec?
   - Complex data transformations across multiple entities?
   - Implies one substantial technical component (engine, parser, scheduler, algorithm, state machine, sync mechanism) that must be built in code?
4. **Identify the split boundaries** — find the natural seams where the spec can be divided. Each resulting spec must be:
   - Independently meaningful (makes sense on its own with previous specs as context)
   - Self-contained (does not require a later spec to be useful)
   - Within the 200 LOC limit
5. **Draft the replacement specs** — write the smaller specs in chronological order, each with its own func-id per `semantic-ids.md`; the replacement that keeps the original's main behavior may keep the original's func-id. The first replacement spec typically sets up the foundation, and subsequent ones layer behavior on top.
6. **Verify functional completeness** — this is critical. The replacement specs taken together must cover **100% of the functionality** described in the original spec. Walk through every behavior, condition, and detail in the original and confirm it appears in exactly one of the replacement specs. Nothing may be lost, weakened, or left implicit. If any functionality from the original is missing, add it to the appropriate replacement spec or create an additional one.
7. **Verify each replacement spec** — run `analyze-if-func-spec-too-complex` on each to confirm it fits within the limit.
8. **Check for conflicts** — run `analyze-func-specs` **once** with the full set of replacement specs plus every existing spec in the file and its `base` chain. The batched analyzer reports every conflicting pair (replacement × existing and replacement × replacement) in one call — do not loop over pairs. Resolve each reported pair with `resolve-spec-conflict`, then re-run `analyze-func-specs` over the touched set until the verdict is `COMPATIBLE`.
9. **Replace in the file** — remove the original functionality (heading and body) and insert the replacement functionalities, each as a `# <func-id>` heading with its body, in its position, preserving chronological order.
10. **Bring the test plain files in step** — invoke `add-test-scenarios` for each replacement functionality. It moves every scenario of the original's test plain file to the replacement it tests, writes scenarios for outcomes that have none, and deletes the original's file when its func-id no longer exists.
11. **Read the file again** to confirm correct placement and syntax.

## Splitting Strategies

### Strategy 1: Separate Distinct Behaviors

If the spec bundles multiple independently testable actions, split each into its own spec.

**Before:**
```plain
***functional specs***

# manage-recipes
A :User: can create, edit, and delete :Recipe: items, with validation on all fields.
```

**After:**
```plain
***functional specs***

# create-recipe
A :User: can create a :Recipe:. Only valid :Recipe: items can be created.

# edit-recipe
A :User: can edit an existing :Recipe:. Validation rules apply to the edited fields.

# delete-recipe
A :User: can delete a :Recipe:.
```

### Strategy 2: Separate Setup from Behavior

If the spec introduces a new construct and immediately defines complex behavior on it, split into setup + behavior.

**Before:**
```plain
***functional specs***

# meal-plan-screen
The :MealPlan: screen displays a weekly grid of :Slot: items, allows drag-and-drop reordering, and shows nutritional totals per day.
```

**After:**
```plain
***functional specs***

# meal-plan-grid
The :MealPlan: screen displays a weekly grid of :Slot: items.

# reorder-slots
A :User: can reorder :Slot: items within a day on the :MealPlan: screen using drag-and-drop.

# daily-nutrition-totals
The :MealPlan: screen displays nutritional totals for each day.
```

### Strategy 3: Separate Core Logic from Cross-Cutting Concerns

If the spec mixes primary functionality with error handling, retries, caching, pagination, or logging, pull cross-cutting concerns into their own specs.

**Before:**
```plain
***functional specs***

# fetch-ingredients
:Ingredient: data is fetched from the external API with pagination, retry on transient errors, and caching for 10 minutes.
```

**After:**
```plain
***functional specs***

# fetch-ingredients
:Ingredient: data is fetched from the external API.

# fetch-ingredients-paged
:Ingredient: data is fetched from the external API in pages.

# retry-ingredient-fetch
Fetching :Ingredient: data is retried on transient errors.
```

### Strategy 4: Separate Conditional Paths

If the spec describes different modes or branches, give each its own spec.

**Before:**
```plain
***functional specs***

# generate-meal-plan
:MealPlan: generation depends on :DietType:. Standard plans use round-robin assignment. Restrictive plans filter out excluded ingredients first, then apply round-robin. Custom plans allow manual slot-by-slot selection.
```

**After:**
```plain
***functional specs***

# generate-standard-plan
A standard :MealPlan: is generated using round-robin :Recipe: assignment.

# generate-restrictive-plan
A restrictive :MealPlan: is generated.
- Excluded :Ingredient: items are filtered out first.
- Round-robin :Recipe: assignment is then applied.

# assign-custom-plan
A :User: can manually assign :Recipe: items to :Slot: items for a custom :MealPlan:.
```

### Strategy 5: Build UI Incrementally

If the spec describes a full screen, split into layout + individual interactive elements.

**Before:**
```plain
***functional specs***

# dashboard-screen
The :Dashboard: screen shows a summary card with stats, a scrollable list of recent :MealPlan: items, a floating action button to create a new plan, and a bottom navigation bar.
```

**After:**
```plain
***functional specs***

# dashboard-summary-card
The :Dashboard: screen shows a summary card with :MealFrameStats:.

# dashboard-recent-plans
The :Dashboard: screen shows a scrollable list of recent :MealPlan: items.

# dashboard-new-plan-button
The :Dashboard: screen includes a button to create a new :MealPlan:.
```

### Strategy 6: Extract a Reusable Technical Component

Sometimes a spec is too complex not because it bundles many behaviors, but because it implies building one substantial technical component inline — an engine, parser, scheduler, layout algorithm, state machine, or sync mechanism. Splitting the behavior sideways does not help when the weight sits in that single component. Instead, pull the component out: define a concept for it, build it in its own dedicated spec placed **earlier** in the chain, then rewrite the original to use the component **by reference**. Because specs render incrementally top-to-bottom, the original now implies far less code — it wires up a component that already exists rather than implementing it from scratch.

Define the component concept in `***definitions***` (via `add-concept`) before the first spec that references it.

**Before:**
```plain
***functional specs***

# export-report-pdf
A :Report: is exported to PDF, laying out multi-page tables with repeating headers, page numbers, and charts rendered from :Report: data.
```

**After:**
```plain
***functional specs***

# pdf-renderer-tables
:PdfRenderer: lays out multi-page tables from structured content.
- Table headers repeat at the top of each page.
- Each page shows its page number.

# export-report-pdf
A :Report: is exported to PDF using :PdfRenderer:, embedding charts rendered from :Report: data.
```

The extracted component spec and the rewritten original must together still cover 100% of the original functionality (step 6): the original must **reference** the component, never re-describe it. Keep the component's technology and architecture choices in `***implementation reqs***`, not in the functional spec. If the component is a self-contained subsystem or will be reused across modules, promote it to its own module with `create-base-module` / `refactor-module` instead of a sibling spec.

## Preserving Chronological Order

The replacement specs take the position of the original spec. Earlier specs remain unchanged. The first replacement spec should make sense given only the specs above it. Each subsequent replacement spec can reference behavior from the ones before it.

The original functionality's test plain file is split the same way: each scenario moves to the replacement functionality it tests, a scenario that no longer fits one replacement is rewritten, and each replacement ends with at least one conformance scenario when conformance tests are enabled (see `add-test-scenarios`).

## Validation Checklist

- [ ] Original spec has been removed from the file
- [ ] Replacement specs together cover 100% of the original spec's functionality — nothing lost
- [ ] Each replacement spec implies ≤ 200 LOC (verified via `analyze-if-func-spec-too-complex`)
- [ ] No conflicts between replacement specs and existing specs (verified via one batched `analyze-func-specs` call)
- [ ] No conflicts between the replacement specs themselves (covered by the same batched call)
- [ ] Replacement specs are in correct chronological order
- [ ] Each replacement spec is independently meaningful
- [ ] All `:Concepts:` referenced in replacement specs are defined
- [ ] Any extracted technical component is defined as a concept, built by its own earlier spec, and only **referenced** (not re-described) by the original
- [ ] Replacement specs are language-agnostic
- [ ] Replacement specs trimmed per `concise-specs.md` — a split is not a licence to re-add prose
- [ ] All external interfaces remain explicit
- [ ] Test plain files follow the split: one per replacement functionality, every original scenario moved or rewritten, none bound to a func-id that no longer exists
