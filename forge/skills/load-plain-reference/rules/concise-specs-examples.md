---
description: Worked BAD to GOOD examples of concise .plain specs, one pair per conciseness failure mode
---

# Worked examples of concise `.plain` specs

`concise-specs.md` is the rule; this file is the example bank behind it. Every entry names one failure mode, shows the padded version, and shows the rewrite that carries the same information.

Read the pairs, not the prose: in each one, the GOOD block says everything the BAD block said, and usually pins down an interface detail the BAD block left open. Conciseness is what makes room for that detail — it is never a licence to drop it. The last section, *Do not over-cut*, shows the failure in the other direction.

The BAD blocks intentionally demonstrate the mistakes they name, including invalid syntax. Copy only from GOOD blocks.

Integration specs fail in their own ways — over-precision, inlined contract data, and edge cases the provider's documentation invites. Those examples are in `concise-specs-integration-examples.md`.

## Padding around one fact

BAD:

```plain
***functional specs***

- In order to provide users with a robust and seamless experience, :TaskService: exposes a comprehensive endpoint for the creation of new :Task: items.

- The endpoint accepts a request and, provided that the incoming payload is valid and well-formed, proceeds to persist the :Task: appropriately.

- If the payload is not valid, an appropriate error is returned to the caller so that the user is informed of the problem.
```

GOOD:

```plain
***functional specs***

- A :User: can create a :Task: via `POST /tasks`.
  - The request body is a :Task: without `id`.
  - The response is `201` with the created :Task:.
  - A request without a name returns `400`.
```

Three bullets became one, and the rewrite names the method, the path, the request shape, and both status codes — none of which the padded version pinned down.

## Rationale, motivation, and benefits

BAD:

```plain
***functional specs***

- Because support staff frequently need to find customers quickly, and because scanning the full list is slow and error-prone, :CustomerDirectory: offers a search capability that greatly improves their daily workflow.
```

GOOD:

```plain
***functional specs***

- :CustomerDirectory: returns :Customer: items whose name or email contains a search term, case-insensitively.
```

Why the feature exists changes nothing about what is built. What "search" matches does.

## Restating a concept's own name

BAD:

```plain
***definitions***

- :InvoiceNumber: is the invoice number of an :Invoice:. It is used to identify invoices.
```

GOOD:

```plain
***definitions***

- :InvoiceNumber: identifies an :Invoice: within a :BillingPeriod: and has the form `INV-<year>-<6 digits>`.
```

A definition that only expands the token into a sentence carries no information. State the scope of uniqueness and the format instead.

## Stating the obvious

BAD:

```plain
***functional specs***

- :OrderApi: returns a list of :Order: items over HTTP.
  - The list contains :Order: items.
  - If there are no :Order: items, the list is empty.
  - Each :Order: has an `id`, which is unique.
  - The caller receives the response after the request is sent.
```

GOOD:

```plain
***functional specs***

- :OrderApi: returns the :Order: items of the authenticated :User: via `GET /orders`, newest first.
  - The response is `200` with a JSON array, empty when the :User: has no :Order: items.
```

Every cut line was already implied: a list of :Order: items contains :Order: items, an identifier identifies, and a response follows a request. What survives is what a reader could *not* have guessed — the ownership filter, the sort order, and the response shape.

Apply the deletion test line by line: *if this line were missing, would anything be built differently?* "The list contains :Order: items" fails it. "Newest first" passes it.

## Universal software defaults

BAD:

```plain
***functional specs***

- :OrderService: validates all incoming data before processing it.

- :OrderService: handles errors and returns meaningful error messages.

- :OrderService: saves the :Order: to storage so that it is not lost.
```

GOOD:

```plain
***functional specs***

- :OrderService: rejects an :Order: whose `total` does not equal the sum of its :OrderLine: amounts, with `422`.
```

Validating input, reporting errors, and persisting on a save operation belong in the `***implementation reqs***` and a baseline is assumed. If there is a specific use case for a particular operation, it should be documented there, not in the `***functional specs***`. The one fact worth stating is *which* rule is enforced and what the caller sees when it fails.

## Standard behavior of a named technology

BAD:

```plain
***implementation reqs***

- :Implementation: uses FastAPI.

- FastAPI parses incoming HTTP requests and routes them to the correct handler function.

- Request and response bodies are serialized to and from JSON.

- :Implementation: uses SQLAlchemy, which opens connections to the database and maps rows to objects.
```

GOOD:

```plain
***implementation reqs***

- :Implementation: is written in Python 3.12 and uses FastAPI.

- :Implementation: uses SQLAlchemy 2.x with a single session per request.
```

Once a technology is named, its documented behavior comes with it. Keep only the choices a reader could not derive from the name — here, the version and the session scope.

## Uncheckable adjectives and adverbs

BAD:

```plain
***implementation reqs***

- :Implementation: handles large files efficiently and gracefully, following modern best practices.

- :UnitTests: provide comprehensive coverage of all important functionality.
```

GOOD:

```plain
***implementation reqs***

- :FileDownloader: streams a file larger than 10 MB to disk instead of holding it in memory.

- :UnitTests: of :FileDownloader: serve fixture files from a local HTTP server, never a live host.
```

`modern`, `best practices`, `efficiently`, `gracefully`, and `comprehensive` fail the same test: no test can distinguish a build that has them from one that does not. Either name the checkable threshold or delete the word.

Note the subject too. `:Implementation:` is the whole codebase — right for a fact that holds everywhere, too coarse for a rule about one behavior, and a requirement no reader can locate is one no reviewer can check. Name the component the requirement constrains.

The coverage line has no checkable version worth writing: testing every branch is what `:UnitTests:` are for, so "comprehensive coverage" converts to nothing. Not every uncheckable line becomes a checkable one — some are cut and replaced by the fact the section was missing, here the one thing nobody can derive: where the bytes come from when the tests run.

## Hedging

BAD:

```plain
***test reqs***

- :ConformanceTests: should ideally use pytest, or another suitable framework if that is more appropriate.

- :ConformanceTests: may optionally mock external HTTP calls where possible.
```

GOOD:

```plain
***test reqs***

- :ConformanceTests: are implemented with pytest.

- :ConformanceTests: mock every external HTTP call.
```

Every hedge hands the renderer a decision the spec was supposed to make. A spec states one
behavior.

## Ornate vocabulary

BAD:

```plain
***functional specs***

- :ReportGenerator: is responsible for facilitating the utilization of a plurality of :DataSource: instances in order to initiate the generation of a :Report: prior to the performance of the validation of the resulting output.
```

GOOD:

```plain
***functional specs***

- :ReportGenerator: builds a :Report: from one or more :DataSource: items, then validates it.
```

Same sequence, plain words. See the substitution table in `concise-specs.md`.

## Sub-bullets that elaborate instead of disambiguating

BAD:

```plain
***functional specs***

- A :User: can archive a :Project:.
  - Archiving is an action the user performs on a project.
  - The archive action is available to users who have access to the project.
  - Once archived, the project is in the archived state.
```

GOOD:

```plain
***functional specs***

- A :User: can archive a :Project: they own.
  - An archived :Project: is excluded from :ProjectList:.
  - Archiving a :Project: that is already archived returns `409`.
```

A sub-bullet earns its line by removing an ambiguity. If it only says the parent again in more words, it is filler.

## Restating the parent bullet

BAD:

```plain
***functional specs***

- :SessionStore: expires a :Session: 30 minutes after its last use.
  - Sessions do not live forever; they time out.
  - The timeout is 30 minutes.
```

GOOD:

```plain
***functional specs***

- :SessionStore: expires a :Session: 30 minutes after its last use.
  - A request carrying an expired :Session: returns `401`.
```

## Synonym drift

BAD:

```plain
***functional specs***

- A :User: can upload a :Document:.

- The system stores the submitted file in :DocumentStore:.

- The uploaded asset is retrievable by its identifier.
```

Three names — `:Document:`, "file", "asset" — read as three things. A reader cannot tell whether "asset" is a fourth concept, and the renderer cannot either.

GOOD:

```plain
***functional specs***

- A :User: can upload a :Document:.
  - :DocumentStore: stores the :Document: and assigns it a :DocumentId:.
  - A :User: can retrieve a :Document: by its :DocumentId:.
```

## Meta-commentary and scope disclaimers

BAD:

```plain
***functional specs***

- This spec is intentionally kept small so that it stays within the complexity limit.

- As described above, :ExportService: writes a :CsvFile:.

- No changes are made to the existing :ImportService: or to the user interface.

- Future specs will extend this behavior with additional formats.
```

GOOD:

```plain
***functional specs***

- :ExportService: writes the :Order: items of a :BillingPeriod: to a :CsvFile:.
  - The header row is `id,customer,total,currency`.
  - An empty :BillingPeriod: produces a :CsvFile: with only the header row.
```

A spec describes the software, not itself. What the spec does *not* change is everything it does not mention, and what later specs will add belongs to those specs.

## Prose and tables inside a section

BAD:

```plain
***functional specs***

- :PricingEngine: applies discounts.
  The discount matrix is as follows:
  | Tier | Volume | Discount |
  |---|---|---|
  | Bronze | 0-99 | 0% |
  | Silver | 100-499 | 5% |
  | Gold | 500+ | 12% |
```

GOOD:

```plain
***functional specs***

- :PricingEngine: applies the :DiscountTier: matrix in [resources/discount-tiers.json](resources/discount-tiers.json) to an :Order: total.
  - An :Order: below the lowest tier threshold gets no discount.
```

A section holds `- ` list items. Matrices, schemas, and payloads are external artifacts and are linked from `resources/` — see `linked-resources.md`.

## Split one crowded bullet across its owning sections

One bullet that mixes behavior, technology, and test policy is hard to review and partly ignored: the renderer reads each concept only from its owning section, so the unit-test and conformance-test facts below never reach the generators that need them.

BAD — everything in one place:

```plain
***definitions***

- :ImageResizer: resizes images.

- :Image: is an image file uploaded by the user.

***functional specs***

- :ImageResizer:, implemented as a Python class using Pillow with a thread pool of 4 workers, resizes an uploaded :Image: to a thumbnail, where a thumbnail is defined as a JPEG at most 256 pixels on its longest edge.
```

GOOD — each fact in the section that owns it:

```plain
***definitions***

- :ImageResizer: resizes images.

- :Image: is an image file uploaded by the user.

- :Thumbnail: is a JPEG derived from an :Image:, at most 256 pixels on its longest edge, with the aspect ratio preserved.

- :UnsupportedImageError: is raised when an :Image: is not a supported format.

***implementation reqs***

- :ImageResizer: resizes images with Pillow, on a thread pool of 4 workers.

***functional specs***

- :ImageResizer: produces a :Thumbnail: from an :Image:.
  - An :Image: already within the :Thumbnail: bounds is returned unchanged.
  - An :Image: that is not a supported format raises :UnsupportedImageError:.
```

Each section now answers one question, and the definition, the mechanism, and the behavior are each one line to check instead of clauses buried in a paragraph about resizing. Use the split whenever a bullet answers more than one of *what is it*, *what does it do*, *how is it built*, and *how is it tested* — see `module-structure.md` for section ownership and canonical section order.

Use `resolve-section-ownership` to perform the split. It is not the same as splitting a functional spec that is simply too large — for that, run `analyze-if-func-spec-too-complex`, then `break-down-func-spec`.

The most common single case of this is a functional spec that states a mechanism rather than a result — a retry schedule, a cache, a token refresh. `impl-reqs.md` owns HOW; a functional spec keeps what a caller observes. `concise-specs-integration-examples.md` works through several.

## Narrated acceptance tests

BAD:

```plain
***acceptance tests***

- The tester should first open the application and log in with a valid account, then navigate to the projects area where they will be able to see the list of projects, and then they should create a new project by filling in the form, after which they should verify that everything worked as expected and the project shows up correctly.
```

GOOD:

```plain
***acceptance tests***

- A :User: creates a :Project: and finds it in :ProjectList:.
  - Sign in as a :User: with no :Project: items.
  - Create a :Project: named `Apollo`.
  - :ProjectList: contains exactly one :Project:, named `Apollo`.
```

One narrated paragraph becomes an ordered set of checkable steps, and "everything worked as
expected" becomes an assertion.
