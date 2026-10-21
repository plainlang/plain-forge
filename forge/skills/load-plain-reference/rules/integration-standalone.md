---
description: Rules for authoring ***plain specs for REST API integrations deployed standalone
---

# Rules for **standalone** integration specs

When an integration `.plain` module is **standalone** — meaning the generated code in `plain_modules/` is the deployable artifact itself (a service, daemon, CLI, scheduled job, container, or library published to a registry) — these rules apply on top of the shared rules in [`integrations.md`](integrations.md). If anything below contradicts a guess made from memory, the rules here win.

Standalone means: the integration is a complete application in its own right, picks its own tech stack, owns its own lifecycle, and exposes its own contract surface to external consumers.

## The integration owns its tech stack

Unlike embedded integrations, a standalone integration has no host to inherit from. Every stack decision is **explicit**, captured during `forge-plain` Phase 2, and recorded in `***implementation reqs***`:

- **Implementation language** and its exact version
- **HTTP client library** (e.g. `httpx`, `requests`, `node-fetch`, `axios`, `go-resty`, `reqwest`) — pinned, with the auth/retry/timeout features the integration uses called out
- **Application framework** (Flask, FastAPI, Express, Fiber, Gin, Spring Boot, …) when the integration exposes HTTP; **CLI framework** (Click, argparse, `cobra`, `clap`) when it exposes a CLI
- **Data storage** (when needed): idempotency-key persistence, webhook deduplication store, OAuth token cache, response cache — pick the storage primitive (SQLite, Postgres, Redis, on-disk file, in-memory with LRU bounds) and pin it
- **Architecture and layering** — which patterns the codebase follows (clean architecture, hexagonal, simple flat package, …)
- **Packaging artifact** — published Python wheel / sdist, npm package, Go binary, container image, OS package, …; one or more, named explicitly

Standalone integrations may freely import any third-party library that isn't constrained by an existing host. Choose the smallest set that solves the problem.

## The contract schema is the public artifact

In an embedded integration, the schema feeds the renderer's code generation; the host codebase consumes the *generated class*. In a standalone integration, the schema is **shipped** to external consumers and the generated implementation is internal to `plain_modules/`.

- **Pick the publication surface and write it into the spec.** Examples (one functional spec per surface):
  - HTTP service: "served at `/openapi.json` (and a Swagger UI at `/docs`)"
  - npm-published library: "published as `<package>` to npm; `package.json` exports the schema as `./schema.json`"
  - PyPI-published library: "published as `<package>` to PyPI; bundle ships `schema.json` as a package data file"
  - CLI: "emitted as `--help` and as `<cli> schema` (JSON-on-stdout)"
  - Queue worker: "published as a JSON Schema in the team's schema registry under `<topic>.v<version>.json`"
  - Scheduled job: "published as JSON Schema in `resources/contract/job-config.schema.json` and linked from the runbook"
- **Schema versioning is part of the contract.** Pin the version in the schema's `$id` / OpenAPI `info.version` and follow semver. Backwards-incompatible changes ship under a new file path, never as mutations to the published version
- **The renderer ships the schema verbatim** — the spec must not restate fields from the schema, and the generated implementation must consume the same file as the published artifact (so the two cannot drift)

## All lifecycle stages must be explicit

A standalone integration has no host lifecycle to delegate to. Every stage that an embedded integration could skip is mandatory here, each one captured as its own functional spec:

- **Initialization** — one-time setup at startup. Read configuration, validate credentials proactively (eager) or defer to first call (lazy) — pick one and write the spec accordingly. Open connection pools, register webhook handlers, initialize observability
- **Credential refresh** — proactive (background timer / pre-expiry refresh) vs. reactive (refresh-on-401). Use a refresh lock to prevent thundering herd. Specify the lock primitive (in-process mutex, distributed lock in Redis, …) when the integration runs as more than one replica
- **Graceful shutdown** — drain in-flight requests with a deadline; what happens to retries still queued (abandoned, persisted, returned to caller as a specific error); what signals trigger shutdown (`SIGTERM`, container-stop hook, …)
- **Health checks** — define what "healthy" means for **this** integration: last successful provider call within a window, valid credentials, provider's own `/health` returning 2xx, dependent storage reachable. Spec the response shape (status code, body) for the health endpoint when one is exposed
- **Background loops** — cron jobs, polling workers, queue consumers: each gets its own functional spec covering trigger, interval, leader-election (if applicable), failure handling, and observability

## Entry-point types — pick deliberately, enumerate fully

A standalone integration exposes one or more **entry points** to its consumers. Mixing entry-point types (e.g. HTTP + queue worker + CLI) is allowed, but every entry point must be enumerated up front and gets at least one functional spec.

| Entry-point type | Public surface | Contract format |
|------------------|----------------|-----------------|
| HTTP service | One or more routes (path + method) | OpenAPI 3.1 (`resources/contract/<integration>.openapi.yaml`) |
| CLI | Command + subcommands + flags | JSON Schema for config + `--help` text seeded from the schema |
| Queue worker | Topic / partition + message envelope | JSON Schema per message type (`resources/contract/<topic>.schema.json`) |
| Scheduled job | Job name + cron expression + config schema | JSON Schema for config |
| Library | Public package surface (functions, classes) | JSON Schema for I/O + published-package manifest |
| Webhook receiver | Provider-driven inbound HTTP | JSON Schema per event type under `resources/webhooks/` (shared with embedded — see [`integrations.md`](integrations.md)) |

Each entry point gets its own functional spec describing what calling it does end-to-end (which Phase 1 specs it composes — auth, the endpoint call, the retry policy, the error handling).

## Side effects are first-class — spell them out

A standalone integration usually mutates state outside the provider call itself. Each side effect is captured as a functional spec describing:

- **What** gets mutated — local DB writes, file writes, cache updates, emitted domain events, metrics, log lines
- **When** the mutation happens — before or after the provider call
- **Is the mutation transactional with the provider call** — atomic, eventually consistent, fire-and-forget
- **What happens on partial failure** — provider call succeeded but the side effect failed (and vice versa); rollback / compensation / retry strategy

## Concurrency and backpressure

Standalone integrations face concurrent load that an embedded library doesn't. The spec must pin:

- **Sync vs. async** in the host-language sense (`async def`, `Promise`, goroutines, threads)
- **Expected peak throughput** (RPS) the consumer will issue
- **Connection pool size**
- **Request queue depth**
- **Backpressure behavior** when the rate limit (from Phase 1 topic 10 — see [`integrations.md`](integrations.md)) and the consumer's demand collide — drop, queue, block with timeout, or 429 the consumer
- **Concurrency limits on mutating operations** — when the provider has its own per-resource serialization constraints

Capture all of this as a concurrency concept and one functional spec for "apply backpressure when local demand exceeds rate-limit budget".

## Configuration surface

- Every config knob the consumer can set lives in `resources/config.schema.json` (JSON Schema): env var names, config file keys, secrets, feature flags, regional selectors, timeouts, retry counts, base URL overrides
- The configuration concept enumerates every key by name (type, default, required vs optional, validation, where it is read — startup vs per-call)
- Secrets are referenced by env var name only; never written into the schema as default values
- One functional spec covers "load and validate configuration on startup" — fail-fast on missing required values

## Versioning of the integration itself

Separate from the provider's API version (which lives in the provider OpenAPI file), the **integration's own contract** is versioned independently:

- Semver of the published library / OpenAPI `info.version` / schema `$id` URL / CLI `--version`
- Backwards-compatibility policy stated explicitly (e.g. "minor and patch are wire-compatible; breaking changes only on major")
- New major versions ship at a new schema path; never mutate a published version in place

Capture as a contract-version concept; pin the version in every published schema.

## Testing — live conformance, secrets from env, webhooks

`:ConformanceTests:` for a standalone integration **run against the live provider** (see [`integrations.md`](integrations.md) → *`:ConformanceTests:` always run against the live integration*). The testing strategy is captured as `***test reqs***` entries authored via `add-test-requirement`:

- **Conformance is live by default.** No VCR cassettes, no prerecorded responses for the calls under test, no mock servers. A green conformance run that never touched the provider proves nothing. Recorded responses may back unit tests — never conformance
- **Secrets come from environment variables.** Pin every credential as an env-var name (e.g. `<PROVIDER>_API_KEY`, `<PROVIDER>_CLIENT_ID` + `<PROVIDER>_CLIENT_SECRET`) in `***test reqs***` and in the auth concept. Use the names the provider's docs use so users don't have to translate
- **The user supplies values via `.env` or the shell.** The project ships `.env.example` (gitignored `.env` for real values). CI provides the same env-var names from its secret store. The conformance script may optionally `source` a `.env` from the project root if one exists; it must verify every required var is set after that optional load and fail fast (exit `69`) on missing vars
- **Sandbox credentials in CI.** Name where credentials come from (CI secret store, dedicated test tenant), the rotation / leak-response policy, and the env-var names CI must set
- **Webhook tests** (if webhooks are in scope) must cover signature verification end-to-end — including invalid signatures and replay attempts. Signing keys are env vars, like every other secret
- **Rate-limit (429) tests.** The 429 path must **not** exhaust the live API's quota — use a local mock for that specific endpoint, document the exception in `***test reqs***`. Every other path remains live
- **Idempotency tests.** Run the same mutating call twice (with the same idempotency key) against the live sandbox and assert the same response

## Standalone-specific completion checklist

Before declaring a standalone integration done, in addition to the shared checklist in [`integrations.md`](integrations.md):

- [ ] Tech stack decisions are recorded in `***implementation reqs***` — language and version, HTTP client library and version, framework (HTTP / CLI / worker as applicable), data storage choice(s), architecture/layering
- [ ] Publication surface(s) for the contract schema are enumerated in functional specs (one per surface)
- [ ] Schema versioning strategy is captured — `$id` / `info.version` / package version pinned, backwards-compatibility policy stated
- [ ] Every entry point is enumerated and has at least one functional spec (HTTP routes, CLI commands, queue topics, scheduled jobs, library APIs)
- [ ] Every lifecycle stage has a functional spec — initialization, credential refresh, graceful shutdown, health check
- [ ] Side effects are each captured as a functional spec with ordering, transactionality, and partial-failure handling
- [ ] Concurrency model is captured (sync vs async, pool size, queue depth, backpressure strategy)
- [ ] Configuration surface lives in `resources/config.schema.json` and is linked from the configuration concept
- [ ] Testing strategy is recorded in `***test reqs***` — live vs recorded, sandbox credential source, webhook signature coverage, rate-limit-test isolation

## Anti-patterns specific to standalone integrations

- **Skipping any lifecycle stage** because it "feels small". Standalone integrations have no host to fall back on; an implicit shutdown is an undefined shutdown
- **Inlining fields from `resources/contract/<entry-point>.schema.json` into a functional spec.** The schema is the source of truth and is **published** — duplicating fields in spec text guarantees drift
- **Mutating a published schema's `$id` / version path** instead of shipping a new file. Consumers may already be pinning the old version
- **Treating configuration as "whatever env vars seem useful at runtime".** Every key lives in `resources/config.schema.json` with type, default, and validation; the loader fails fast on missing required values
- **Picking a tech stack incrementally during Phase 3.** Decide it once at the top of `forge-plain` Phase 2 and transcribe into `***implementation reqs***`; don't accrete a stack across several specs
- **Hitting the live provider in rate-limit (429) or destructive-error (500) tests.** Use a local mock; live calls are for the happy path and for sandbox-safe error paths
