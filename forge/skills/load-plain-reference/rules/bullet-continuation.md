---
description: Bullet and continuation syntax for every section in .plain files
---

# Rules for bullets and continuations in `.plain` files

These rules apply to every section and to concept explanations.

## No line-length limit

- `.plain` does not impose a maximum number of characters per line
- Do not split a valid line merely to satisfy an arbitrary formatting width
- Prefer clear, precise wording; concision must never remove required detail
- Length is bounded by content, not by width: say everything required, in the fewest plain words that stay exact (see `concise-specs.md`)

## One statement per line

This is the preferred `.plain` authoring convention, not something the renderer enforces. A line
break in a section means one of exactly two things: a new `- ` statement, or a nested `- `
clarification of the statement above it. There is no third, typographic reason to break a line.

- Write each statement on a single line, however long
- Never break a line just for width: a bare continuation (an indented line without `- `) adds a
  line break that carries no structure — to every future reader and editing agent it is
  indistinguishable from a deliberate sub-point
- The test: if content deserves its own line, it deserves its own `- ` bullet; if it doesn't,
  keep it on the parent's line
- What the renderer does enforce is the top level: every statement in a section must be a `- `
  list item — a flush-left prose line is a syntax error. A bare continuation, by contrast, is
  accepted and folded into its parent item verbatim

BAD — line broken for width (bare continuation):

```plain
***functional specs***

- :GatewayWebhook: hands off :StripeRequest: to :StripeIntegration:.handle(),
  which returns a list of :EventEnvelope: dicts conforming to the gateway contract.
```

GOOD — one valid list item:

```plain
***functional specs***

- :GatewayWebhook: hands off :StripeRequest: to :StripeIntegration:.handle(), which returns a list of :EventEnvelope: dicts conforming to the gateway contract.
```

BEST — separate clarifications expressed as nested bullets:

```plain
***functional specs***

- :GatewayWebhook: hands off :StripeRequest: to :StripeIntegration:.handle().
  - The method returns a list of :EventEnvelope: dicts.
  - The dicts conform to the gateway's :EventEnvelope: contract.
```

## Presenting `.plain` examples

- Show every example under its owning section header
- Separate top-level list items with one blank line
- Keep nested clarifications directly under their parent without a blank line
- BAD, WRONG, `Before:`, and `Too complex:` examples may intentionally demonstrate invalid syntax

## Content that belongs in resources

Long URLs, schema fragments, and example payloads belong in `resources/` because they are external
artifacts, not because of their character count. Follow `linked-resources.md`.
