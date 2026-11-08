---
description: Rules for authoring ***plain specs for REST API integrations embedded into an existing host codebase
---

# Rules for **embedded** integration specs

When an integration `.plain` module is **embedded** — meaning the generated code in `plain_modules/` is consumed in-process by an existing host codebase as a library / module — it is a module embedded in a host, so every rule in [`host-embedded.md`](host-embedded.md) applies: the host dictates the stack, the project lives under `plain/`, discovery comes before questions, host symbols are referenced by fully qualified path, host files are linked in place, and the test scripts stage into the host. The rules below are what an **integration** adds on top of those and of the shared rules in [`integrations.md`](integrations.md). If anything below contradicts a guess made from memory, the rules here win.

> **For test-script authoring**, follow [`integration-embedded-testing.md`](integration-embedded-testing.md), as `host-embedded.md` describes.

## Discovery: the host's existing integrations are the peers

Step 2 of *Discover before you ask* in [`host-embedded.md`](host-embedded.md) reads the host code that plays the same role as the module. For an integration, that is **every existing integration in the host**. For each one, extract: intent and scope, host base class / interface / protocol the integration subclasses or implements, package path and naming convention, configuration pattern (env vars, settings module, secret manager), error / exception hierarchy, logging / metrics / tracing conventions, testing pattern (live vs recorded vs mocked, fixture location, conformance-test layout). Cite the existing integration by file path in the `host-codebase` concept.

The user's time goes into what the host cannot show: the third-party API itself (provider, docs, endpoints, edge cases, webhooks) and authentication / credentials.

## The contract spec declares inheritance, not duplication

- The entry-point class / interface / struct in the contract spec must `subclass` / `implements` / `embeds` the host symbol by its full import path
- The spec describes only the **integration-specific additions and overrides** — never restates the parent's fields or methods
- The additions and overrides are themselves expressed in the linked schema under `resources/contract/` (JSON Schema or OpenAPI), with `allOf` / `$ref` extending the host's schema rather than duplicating fields
- If a host base class adds fields the integration shouldn't redeclare, the contract schema's `allOf` chain captures that explicitly
- The renderer may redefine only symbols the host does not provide **and** the contract schema does not capture

## Renderer directives go in the spec, shapes go in the schema

Each contract spec carries the language-specific glue that the schema can't express:

- Target generated-class fully qualified name (e.g. `plain_modules.integrations.<provider>.Client`)
- Target file path under `plain_modules/`
- Host base class import path to subclass / implement
- Host-package version pins (e.g. `pydantic ~= 2.5`, `fastapi ^0.110`)
- Framework-specific decorators or metaclasses (`model_config`, `@Depends`, …)

The renderer reads the directives from the spec and the shapes from the linked schema, then emits the host-language class. The spec must **not** also contain a class body or a field list — that creates two sources of truth and they will drift.

## Integration-owned artifacts under `resources/`

Of the artifacts [`host-embedded.md`](host-embedded.md) keeps under `resources/`, an embedded integration typically authors:

- **Contract schemas** — `resources/contract/<entry-point>.schema.json`
- **Configuration schema** — `resources/config.schema.json`
- **Static lookup tables** the integration owns — `resources/error-map.yaml`, `resources/retry-policy.yaml`, etc.

## Embedded-integration completion checklist

Before declaring an embedded integration done, walk the completion checklist in [`host-embedded.md`](host-embedded.md), the shared checklist in [`integrations.md`](integrations.md), and:

- [ ] The `host-codebase` concept cites the existing integrations it was derived from, by file path
- [ ] Contract spec carries renderer directives (target language, target file path, target class name, host base class to subclass, host-package pins) and **links** to the contract schema; no class body is inlined
- [ ] The integration follows the patterns of the host's existing integrations, or the user explicitly opted out of each one it does not follow

## Anti-patterns specific to embedded integrations

- **Inlining a host base class body into the contract spec.** Reference the host file as a linked resource **at its original host-relative path** — do not inline its contents and do not copy it into `resources/`
- **Restating the host base class's fields or methods in the contract schema** instead of extending it with `allOf` / `$ref`
- **Authoring an integration spec that contradicts an existing integration in the same host** without first surfacing the conflict and getting explicit user confirmation
