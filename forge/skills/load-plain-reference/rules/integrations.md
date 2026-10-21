---
description: Rules for authoring ***plain specs for REST API integrations
---

# Rules for writing integration specs in `***plain`

When writing or editing a `.plain` file that describes an **integration** against a REST API (synchronous JSON/HTTP request-response plus webhook callbacks), always follow these rules. Non-REST integrations (gRPC, GraphQL, SOAP, message brokers, raw TCP, file drops) are out of scope of these rules.

## Scope of "integration" specs
- An integration `.plain` module describes how the project talks to a **third-party or internal REST API**
- The integration may be **embedded** (lives as a library/module inside an existing host codebase) — see [`integration-embedded.md`](integration-embedded.md) for the additional rules that apply
- Or **standalone** (a service, daemon, CLI, scheduled job, or container) — see [`integration-standalone.md`](integration-standalone.md) for the additional rules that apply
- The contract surface, edge-case coverage, live-API cross-check, and `resources/` layout described below apply to **both** shapes — the shape-specific rule files add to them, never replace them

## Contract artifacts live in `resources/` (hard rule)

**Every structural contract the integration deals with — endpoint definitions, request/response schemas, error envelopes, webhook payloads, pagination envelopes, rate-limit headers, the integration's own I/O contract — lives in `resources/` as a linked resource.** Concepts and functional specs **reference** these files; they never restate fields, types, status codes, or header names inline.

Pick the right format per artifact:

| Artifact | Format | Conventional path |
|----------|--------|-------------------|
| Provider's REST surface | OpenAPI 3.1 (YAML or JSON) | `resources/<provider>.openapi.yaml` |
| Webhook payload (per event type) | JSON Schema Draft 2020-12 | `resources/webhooks/<event>.schema.json` |
| Rich webhook contracts (multi-channel) | AsyncAPI 2.6+ | `resources/webhooks.asyncapi.yaml` |
| Integration's own I/O contract | JSON Schema or OpenAPI | `resources/contract/<entry-point>.schema.json` |
| Configuration surface | JSON Schema | `resources/config.schema.json` |
| Error code → category mapping | YAML enum | `resources/error-map.yaml` |
| Rate-limit header inventory | YAML enum | `resources/rate-limit-headers.yaml` |
| Retry policy parameters | YAML enum | `resources/retry-policy.yaml` |
| Provider behavior with no machine-readable home | Markdown | `resources/<provider>-notes.md` |

Rules that flow from this:

- **Provider behavior is recorded, not specified.** How the provider itself works — its quota accounting, consistency guarantees, documented quirks, and any place the live API diverges from its docs — is true and worth capturing, but it is not a requirement on the software being built. Whatever has a machine-readable home in the table above goes there; the rest goes in `resources/<provider>-notes.md`. A functional spec never states provider behavior; it states what the integration does in the face of it.
- **Concepts carry references, not data.** An endpoint concept names the endpoint and points at its OpenAPI `paths.<path>.<method>` entry; it does not duplicate the request/response shape in concept attributes. Same for webhook concepts, error-model concepts, pagination concepts, etc.
- **Functional specs consume linked resources.** A spec describes **behavior** ("call endpoint X, parse the response, classify errors, retry on 5xx") and links to the resource that supplies the **shape**. Field names, types, and validation rules live in the resource file.
- **Schemas are versioned by file path.** When the provider releases a new API version, copy the new OpenAPI file to a new path (e.g. `resources/<provider>.v2.openapi.yaml`); never mutate the v1 file in place.
- **The renderer generates language-native types from the resources.** For embedded integrations the renderer reads JSON Schema / OpenAPI components and emits Pydantic / TypeScript / Go types in `plain_modules/`. The spec declares **which** schema to generate from, **where** the generated type should land, and **what host base class** it must subclass — but never restates the schema's fields.

A single `.plain` module can (and typically will) reference many resources. That is the intended pattern; do not try to collapse them into one mega-file.

## Live API must be cross-checked against the documentation

Documentation lies — it goes stale, omits undocumented fields, describes a different API version, papers over breaking changes. Every integration spec must be grounded in what the API really returns, not what the docs claim it returns.

- **Discover the documentation links with web search first, then `fetch` all of them.** Documentation moves, gets reorganized, and is versioned — so never assume a doc URL from memory. Begin every topic by issuing **web searches with human-readable queries** to find the canonical pages, then `fetch` **every** relevant link the search surfaces — the endpoint reference, the auth guide, the webhook catalog, the error reference, the pagination/rate-limit docs, the changelog. The search step finds *which* URLs are authoritative and current; the `fetch` step retrieves their actual content. Do not stop at the first hit — fetch the full set so a topic is grounded in all of its sources, not a single page.
  - If the environment has **no web-search tool** (only URL-based `fetch` is available), say so explicitly, construct the URL from the provider's well-known documentation root and crawl outward by `fetch`-ing that root and following its links, and ask the user for the canonical URL whenever you cannot reach the right page that way. Never substitute memory for the search-then-fetch step.
- **Always `fetch` the provider's documentation — even if you already "know" the API.** The only acceptable source of truth for what the API looks like *today* is the provider's own live documentation, retrieved with `fetch` at spec-authoring time. This applies without exception — there is no API well-known enough to skip this step, and a spec authored from memory is a spec authored against the wrong contract. Concretely:
  - Before authoring **any** endpoint, auth, error, pagination, or webhook concept, **web-search to locate the relevant documentation page(s), then `fetch` each one** and quote concrete details (status codes, field names, header names, error formats) directly from the fetched content into the resources under `resources/`. Never paraphrase from memory.
  - If a documentation page is unreachable (paywall, login wall, JS-only render that `fetch` can't see), say so explicitly and ask the user for the canonical content rather than filling the gap from memory.
  - **The fetched documentation is then cross-checked against the live API** — see the rest of this section.
- **Validate credentials against the live API** before authoring downstream specs. A 2xx on a low-risk read-only endpoint (`/v1/me`, `/account`, `/whoami`, `/health`) is the gate. On 401/403, stop and resolve before continuing. The credentials should be validated against the live API before any downstream specs are authored.
- **Issue the minimum cross-check coverage** with `fetch`: one discovery / schema endpoint if available, one list endpoint per primary entity in scope, one single-object retrieval per primary entity, one empty/boundary response, one 404, one 400/422, and one deliberate 401.
- **Where the docs and the live API disagree, the live API wins** — the resource records what the API actually returns, and nothing records the disagreement itself.
- **Only `GET` / `HEAD` / `OPTIONS` on the cross-check.** Mutating calls (`POST`, `PATCH`, `PUT`, `DELETE`) require explicit per-call user confirmation and must target a sandbox account.
- **Credentials are never written to `.plain` files or summaries.** Reference them by env-var name only.

## `:ConformanceTests:` always run against the live integration (hard rule)

Integrations exist to talk to a real third-party (or internal) API. Their `:ConformanceTests:` therefore **always run against the live integration** — no VCR cassettes, no recorded fixtures, no `nock` / `WireMock` / `MSW` mocks for the calls under test. A "green" conformance run that never touched the provider proves nothing about the integration.

- The integration's `:ConformanceTests:` **must** make real network calls to the provider (typically a sandbox / staging environment, occasionally production for read-only paths). Recorded responses may back unit tests, but they are **not** a substitute for live conformance
- The only exceptions are paths that **cannot** be exercised live safely:
  - **Rate-limit (429) tests** — must not exhaust the live quota; use a local mock for that specific endpoint
  - **Deliberately destructive failure modes** (forced 5xx) the provider doesn't let you trigger — same; mock the specific endpoint
  Document each exception explicitly in `***test reqs***`; everything else is live by default

### Secrets come from the environment

Live conformance needs credentials. The integration spec must pin every credential as **an env var name, never a literal value**, and the conformance script must read those env vars at runtime:

- **Author the env-var names in `***test reqs***`** (using `:ConformanceTests:`) and again in the auth concept. Examples: `STRIPE_API_KEY`, `GITHUB_TOKEN`, `SALESFORCE_CLIENT_ID` + `SALESFORCE_CLIENT_SECRET`. Use names that match what the provider's own docs use, so a user copying values from the provider console doesn't need to translate
- **The user supplies the values out-of-band**, either:
  - in a `.env` file at the project root (`.env` is gitignored; the project ships `.env.example` with the names but no values), or
  - exported in the shell that invokes the test scripts (CI uses the same names from its secret store)
- **`run_conformance_tests_<lang>` reads the env vars at runtime.** If a required var is missing, the script must fail fast with `Error: <NAME> is required for :ConformanceTests:` and exit `69` (per the testing-script exit-code conventions). Never default to a placeholder, never use a value baked into the script
- **The script may optionally load a `.env` file** before running the suite — typical pattern is to look for `.env` in the project root and `source` / `dotenv -e` it if present, but never fail when it's absent (since CI provides the vars directly via the shell). If a `.env` loader is used, the script must verify each required var is set **after** loading, not before
- **The conformance suite reads the same env-var names** the integration's runtime reads — so a credential that works at runtime is the same credential that exercises the suite
- **Credentials never appear in `.plain` files, commits, summaries, logs, or fixtures.** The cross-check (see *Live API must be cross-checked*) already requires redacting credentials from saved fixtures; the same rule applies to conformance logs

The `.plain` spec should make this discoverable. A minimal `***test reqs***` block for an integration looks like:

```plain
- :ConformanceTests: run against the live :ProviderName: sandbox — no mocking of provider calls.
  - Credentials are read from the environment, never from a file checked into the repo.
  - The conformance script reads `<PROVIDER>_API_KEY` (and any additional secrets) from the shell or from a `.env` file at the project root.
  - The script must verify every required env var is set after the optional `.env` load and fail fast with a clear error if any is missing.
  - The 429 (rate-limit) and forced-5xx paths use a local mock for that specific endpoint; every other path is live.
```

## Embedded vs standalone — pick the shape early

Every integration is either **embedded** (lives as a library/module inside an existing host codebase) or **standalone** (a service, daemon, CLI, scheduled job, or container). The choice is captured as a concept (`integration-shape: embedded | standalone`) so later specs can reference it.

The contract artifact itself is **identical** across both shapes: a JSON Schema (or OpenAPI) file under `resources/contract/`. What changes is **what the renderer emits from it** and **what extra context the spec carries**:

- **Embedded** → the renderer generates a host-language class from the schema and wires it into the host's import path. The host codebase dictates the tech stack — see [`integration-embedded.md`](integration-embedded.md) for the full ruleset
- **Standalone** → the renderer treats the schema as the public artifact: it generates an internal implementation in `plain_modules/` and ships the schema verbatim for external consumers. The integration owns its stack — see [`integration-standalone.md`](integration-standalone.md) for the full ruleset

## Edge-case coverage is a hard floor, not a stretch goal

A production-ready integration spec captures every corner case the API can throw at the integration. Each of the following must be in the specs (or explicitly recorded as "not applicable" / "not in scope" with the user's acknowledgement) before the integration is considered complete:

- **Provider, purpose, canonical documentation URL(s)** as concepts
- **Endpoints in scope** in `resources/<provider>.openapi.yaml`, one `paths.<path>.<method>` entry per endpoint; endpoint concepts link to the OpenAPI entry
- **Auth scheme**, credential source pinned by env-var name, refresh policy, scopes — with `components.securitySchemes` in the OpenAPI matching
- **Environments** (sandbox / staging / production) and the switch mechanism — reflected in `servers` of the OpenAPI file
- **API version pinning** strategy (URL path, header, `Accept`, query string) and the deprecation policy
- **Request serialization** (content type, date format, numeric precision, custom headers) in `components.schemas` / `components.parameters`
- **Pagination model** as `components.schemas.PageEnvelope` plus `resources/pagination.yaml` (style, defaults, safety cap)
- **Rate-limit model** as `resources/rate-limit-headers.yaml` + `resources/rate-limits.yaml` + `components.schemas.RateLimitError`
- **Error model** as `components.schemas.ErrorEnvelope` + `resources/error-map.yaml`, with one functional spec per error category
- **Retry policy** in `resources/retry-policy.yaml`
- **Transient vs. permanent exception classification** — every error the integration can raise is classified as either *transient* (retryable per the retry policy above) or *permanent* (surfaced to the caller immediately). The classification lives in `resources/error-map.yaml` (per-status-code) and in the integration's own exception hierarchy concept, and the two must agree. Concretely:
  - **Transient by default**: network-level errors (`ConnectionError` / equivalent, DNS failure, socket timeout, TLS handshake failure, connection reset), HTTP 408, 425, 429, 500, 502, 503, 504, and any provider-specific application-level error codes the docs / live API mark as retryable (e.g. Stripe's `lock_timeout`, AWS `ThrottlingException`)
  - **Permanent by default**: every other 4xx (400, 401, 403, 404, 405, 409, 410, 415, 422, …), schema-validation failures on otherwise-2xx responses, signature-verification failures on webhooks, and any provider error code the docs / live API mark as non-retryable
  - **Integration exception hierarchy**: the integration exposes a base exception class (e.g. `<Provider>Error`) with two direct subclasses, `<Provider>TransientError` (raised after the retry policy gives up on a transient condition) and `<Provider>PermanentError` (raised immediately on a permanent condition). Every concrete exception inherits from exactly one of those two — callers branch on the base class, never on individual subclasses
  - **The classification is data-driven**, not code-driven — `resources/error-map.yaml` is the source of truth, the renderer reads it to generate the exception hierarchy and the `is_transient(error) -> bool` predicate. Spec text never enumerates status codes inline
  - **Discrepancies found during the live-API cross-check override the docs** — if the docs say a code is transient but the live API never recovers from it (or vice versa), the live behavior wins and the divergence is recorded in `error-map.yaml` plus a note in the error-model concept ("docs claim X retryable, live API returns Y permanently; we follow the live API")
- **Idempotency strategy** in `resources/idempotency.yaml` + idempotency header in `components.parameters`
- **Webhook contracts** as `resources/webhooks/<event>.schema.json` per event type + `resources/webhook-signing.yaml`
- **Data mapping** (entity schemas + transformations / exclusions) as entity schemas + `resources/data-mapping.yaml`
- **Compliance / data-sensitivity** constraints (PII, PHI, payment data, data residency, log redaction, audit logs)
- **Observability** (log fields, provider request IDs, metrics, tracing propagation)

## Anti-patterns (do not do these)

- **Restating an OpenAPI / JSON Schema field list in a concept or functional spec.** The schema lives in `resources/`; the spec links to it
- **Pasting a webhook payload, error envelope, or list-endpoint response inline.** Describe its shape in the applicable schema under `resources/` and link that schema
- **Inlining a host base class body into the contract spec.** Add the host file as a linked resource under `resources/host/` and reference it by FQN
- **Embedding credentials, tokens, or signing keys in a `.plain` file or in a summary** — credentials are referenced by env-var name only
- **Authoring against unverified credentials.** Validate first; if the user has no credentials yet, flag it in the module's frontmatter description and re-validate once credentials arrive
- **`requires`-ing a separate-stack module** (a Python backend `requires`-ing a React frontend, or vice versa) — see [`requires-modules.md`](requires-modules.md). Use a shared API schema in `resources/` instead
- **Authoring Phase 1 specs from the docs first and "reconciling" with the live API later.** Probe the API as you reach each topic; the live response is the source of truth from the moment it's captured
- **Writing any integration spec from memory of the provider's API instead of web-searching for its documentation and `fetch`-ing every relevant page first.** No matter how well-known the API (Stripe, GitHub, Slack, Salesforce, AWS, OpenAI, …), the canonical pages must be located with web search and then retrieved with `fetch` at spec-authoring time — see *Live API must be cross-checked against the documentation*. Authoring from memory bakes in whatever version of the API was current during training, which is always older than the version the integration will actually call
- **Guessing a documentation URL from memory and `fetch`-ing it without searching first.** A remembered URL may 404, redirect to a stale version, or miss the page that actually documents the topic. Search to find the authoritative, current links, then fetch the full set
