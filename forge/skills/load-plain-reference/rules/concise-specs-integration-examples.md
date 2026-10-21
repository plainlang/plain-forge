---
description: Worked BAD to GOOD examples of concise integration specs, where over-precision and obvious edge cases dominate
---

# Worked examples of concise integration specs

`concise-specs.md` is the rule and `concise-specs-examples.md` is the general example bank. This file covers integration specs only, because they fail differently.

An integration is technically demanding, the provider's contract is large, and the author has the provider's documentation open while writing. The result is a spec that is *too precise*: status codes, field lists, retry arithmetic, and every edge case the API can produce, written out as prose bullets. It reads as rigorous and is unreviewable.

Conciseness here is almost never about covering less. `integrations.md` makes edge-case coverage a hard floor — auth, environments, versioning, pagination, rate limits, the error model, retries, idempotency, webhooks, data mapping, compliance, observability. Every one of those must be covered. The lever is **where** the coverage lives:

- **Shapes and enumerations go to `resources/`** — schemas, error maps, retry policy, rate-limit headers. A spec bullet links to the file; it never restates its contents.
- **The spec keeps behavior** — what the integration does with the shape, and what a caller observes.
- **Mechanism goes to `***implementation reqs***`** — retry logic, exception hierarchies, token caching, connection handling. Integration precision is mostly HOW, and `impl-reqs.md` owns HOW. `***functional specs***` keeps only what a caller can observe.

That last lever is easy to miss, so several examples below move a bullet between sections rather than shortening it. A fact in the wrong section is worse than a verbose one: the renderer reads each concept only from its owning section, so a misplaced fact is silently ignored.

Applied consistently, a spec gets shorter as coverage goes *up*, because each new corner case adds a line to a resource file rather than a paragraph to the spec.

The BAD blocks intentionally demonstrate the mistakes they name, including invalid syntax. Copy only from GOOD blocks.

## Status codes and error categories enumerated inline

BAD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

***functional specs***

- :ProviderClient: retries the request when :ProviderApi: returns 408, 425, 429, 500, 502, 503, or 504, and also on connection errors, DNS failures, socket timeouts, TLS handshake failures, and connection resets.

- :ProviderClient: does not retry on 400, 401, 403, 404, 405, 409, 410, 415, or 422, and raises immediately.

- On 429, :ProviderClient: waits and tries again, unless the retry budget is exhausted.
```

GOOD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

***implementation reqs***

- :ProviderClient: classifies every failure of :ProviderApi: through [resources/error-map.yaml](resources/error-map.yaml) and retries the transient ones under [resources/retry-policy.yaml](resources/retry-policy.yaml).
```

The status-code lists move into `error-map.yaml`, which the renderer already reads to generate the exception hierarchy and the transient predicate. Coverage is unchanged and the classification now has one source of truth instead of two that can disagree — see *Transient vs. permanent exception classification* in `integrations.md`.

Note the section too. Classifying and retrying is mechanism, so it is an implementation req; what belongs in `***functional specs***` is only the part a caller observes — which exception each error category surfaces as.

## Restating a schema the resource already carries

BAD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :Customer: is a customer record returned by :ProviderApi:. It has an `id` (string), an `email` (string), a `created_at` (ISO 8601 timestamp), a `status` (one of `active`, `pending`, `churned`), an optional `phone` (string or null), and a `metadata` object of string keys to string values.
```

GOOD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :Customer: is a :ProviderApi: record, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml) under `components.schemas.Customer`.
```

Field lists rot the moment the provider adds a field, and the renderer generates types from the schema, not from the sentence. Keep in the definition only what the schema cannot say — a stability or uniqueness guarantee, a unit, a lifecycle rule.

## Specifying the provider instead of the integration

BAD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :Customer: is a :ProviderApi: record, at `components.schemas.Customer`.

***functional specs***

- :ProviderApi: returns `200` with a JSON body when a request succeeds.

- :ProviderApi: returns `404` when the requested :Customer: does not exist.

- :ProviderApi: rate-limits clients and includes the remaining quota in the response headers.

- :ProviderApi: requires the `Authorization` header on every request.
```

GOOD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :ProviderClient: is the component every call to :ProviderApi: goes through.

- :Customer: is a :ProviderApi: record, at `components.schemas.Customer`.

- :CustomerId: identifies a :Customer: and is stable across updates.

- :CustomerNotFoundError: is raised when :ProviderApi: has no :Customer: for a :CustomerId:.

***implementation reqs***

- :ProviderClient: authenticates to :ProviderApi: with the credential in the environment variable `PROVIDER_API_KEY`.

- :ProviderClient: raises :CustomerNotFoundError: when :ProviderApi: has no :Customer: for the requested :CustomerId:.

***functional specs***

- :ProviderClient: fetches a :Customer: from :ProviderApi: by :CustomerId:.
```

Every BAD bullet is true, and none of them is deleted — they are moved. The success shape, the `404`, and the `Authorization` requirement are what an OpenAPI file exists to state; the rate-limit model has its own conventional files. Provider behavior with no machine-readable home goes in `resources/<provider>-notes.md`. `integrations.md` carries the full artifact table.

What stays in the sections is only what gets built. A bullet stating provider behavior renders into nothing — the renderer cannot build the provider, and no conformance test can assert a sentence that makes no claim about the integration. State instead what the integration does when the provider behaves that way.

Note where the links hang: both artifacts attach to the :ProviderApi: concept, and everything else references the token. `linked-resources.md` requires each resource to be linked from exactly one place, so a second spec needing the contract cannot introduce a second, divergent reference to it.

## One operation fragmented into several specs

Integration work invites this: the author walks through the request lifecycle — credential check, discovery call, request shape, paging — and each step becomes its own spec.

BAD — four specs, one operation:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :Record: is an account record of :ProviderApi:.

***functional specs***

- A call to `fetch` fails before any request to :ProviderApi: is sent when `PROVIDER_API_KEY` is unset or empty.
  - The failure names `PROVIDER_API_KEY`.

- A call to `fetch` reads the field catalogue from :ProviderApi: once, before requesting any :Record:.
  - The catalogue yields the name of every field the account defines.
  - A call to `fetch` whose catalogue read fails requests no :Record: items.

- A request for :Record: items from :ProviderApi: names every field in the catalogue and asks for at most 100 records.
  - Archived :Record: items are not requested.

- A call to `fetch` requests pages until :ProviderApi: returns a response carrying no next-page cursor.
  - Each page after the first is requested with the cursor from the previous response.
  - The :Record: items of every page are carried forward together.
```

GOOD — one spec, with the result stated first:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :Record: is an account record of :ProviderApi:.

- :RecordSource: is the component through which the integration reads :Record: items from :ProviderApi:.

***functional specs***

- :RecordSource: `fetch()` returns every non-archived :Record: with every field :ProviderApi: defines, paging under [resources/pagination.yaml](resources/pagination.yaml).
  - :RecordSource: reads the field catalogue once per `fetch()`.
  - `fetch()` fails before any request when `PROVIDER_API_KEY` is unset or empty, naming it.
  - A failed catalogue read fails `fetch()` before any :Record: is requested.
```

Merging is not in tension with the complexity limit. Split a spec when it implies more than 200 changed lines of code (`analyze-if-func-spec-too-complex`, then `break-down-func-spec`); merge when several specs implement one operation that fits inside that budget. Fragment count is not a measure of size.

## The auth flow narrated step by step

BAD:

```plain
***functional specs***

- :ProviderAuth: first reads the client id and the client secret, then builds a form-encoded body containing `grant_type=client_credentials`, the client id, and the client secret, then posts that body to the token endpoint, then parses the JSON response, then extracts the `access_token` and the `expires_in` fields, then stores the token in memory together with the moment it expires, and then attaches it to subsequent requests as a bearer token.

- Before each request, :ProviderAuth: compares the current time to the stored expiry and, if the token has expired or is about to expire, repeats the whole procedure described above to obtain a new token.
```

GOOD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

- :ProviderClient: is the component every call to :ProviderApi: goes through.

- :AccessToken: is the bearer credential :ProviderApi: accepts.

- :AuthTokenManager: manages the lifecycle of all :AccessToken:

***implementation reqs***

- :ProviderAuth: obtains an :AccessToken: by the grant in [resources/provider.openapi.yaml](resources/provider.openapi.yaml) under `components.securitySchemes.oauth2`.

- :ProviderAuth: reads `PROVIDER_CLIENT_ID` and `PROVIDER_CLIENT_SECRET` from the environment.

- :AuthTokenManager: refreshes an :AccessToken: 60 seconds before it expires, and once on a `401` from :ProviderApi:.

- Concurrent requests finding the :AccessToken: expired cause one refresh.

- :ProviderClient: uses :AuthTokenManager: to cache and refresh :AccessToken:.
```

The grant type, endpoint, body encoding, and response fields are in the security scheme. What
survives is the policy the scheme does not describe: the env-var names, the refresh margin, the
retry-once-on-401 rule, and the concurrency behavior.

Almost all of it is implementation reqs — acquisition, caching, and refresh are machinery a caller never sees. Not all of it, though, and the rewrite has to name a component to say the rest. :ProviderAuth: performs the grant and has no observable surface; :AuthTokenManager: is what consumes it and hands tokens to :ProviderClient:, so it is the concept a functional spec can take as its subject. Without that consumer the section is left with a subject-less bullet, which `func-specs.md` rules out — and that one spec is the only line here a live conformance test can assert.

## Per-endpoint test reqs

BAD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

***test reqs***

- :ConformanceTests: for the customer list endpoint run against the live :ProviderApi: sandbox.

- :ConformanceTests: for the customer retrieval endpoint run against the live :ProviderApi: sandbox.

- :ConformanceTests: for the invoice list endpoint run against the live :ProviderApi: sandbox.

- :ConformanceTests: for the webhook endpoint run against the live :ProviderApi: sandbox.

- :ConformanceTests: for the customer list endpoint use the credentials from the environment.

- :ConformanceTests: for the invoice list endpoint use the credentials from the environment.
```

GOOD:

```plain
***definitions***

- :ProviderApi: is the REST surface of the provider, defined by [resources/provider.openapi.yaml](resources/provider.openapi.yaml).

***test reqs***

- :ConformanceTests: run against the live :ProviderApi: sandbox — no recorded fixtures and no mocking of provider calls.
  - Credentials come from `PROVIDER_CLIENT_ID` and `PROVIDER_CLIENT_SECRET` in the environment.
  - The `429` and forced-`5xx` paths mock that endpoint alone; every other path is live.

- :ConformanceTests: are executed via the run script [test_scripts/run_conformance_tests_python.sh](test_scripts/run_conformance_tests_python.sh).
```

A policy that holds for every endpoint is stated once. Enumerate an endpoint only where it departs
from the policy — here, the two paths that cannot be exercised live safely, which
`integrations.md` requires to be documented explicitly.
