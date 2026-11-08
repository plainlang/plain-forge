# Phase 1 — Scan the host and discover its units

Read-only. The output is a ranked list of candidate units, each with evidence, recorded as `scan` in `plain/capture.json`.

## 1. Reuse a scan of the same commit

If `scan.commit` in the manifest equals `HEAD`, reuse `scan.candidates` and go to Phase 2. Scanning the same commit again can only reword or reorder the candidates, which breaks idempotency. Scan again only when `HEAD` moved or the user asks for it.

## 2. Read the host

Run `capture-state.mjs inventory`. For a large folder, run it again with `--under <folder>` instead of listing the folder by hand. Then read the host and record each fact below with the file that shows it. These facts become the host context module in Phase 3.

| Fact | Where it usually shows |
|---|---|
| Languages and exact versions; dependency manager and manifest | the dependency manifests from `inventory`, lock files, toolchain files (`.tool-versions`, `.nvmrc`, `.python-version`) |
| How the host starts, in development, test, and production | `main`/`bin` entry points, `Procfile`, `Dockerfile`, compose files, start scripts, README |
| How parts are wired together: routing, dependency injection, plugin folders, registries | the framework's boot files, router setup, container or module configuration |
| Test runner, test layout, and how to run the tests of one part — including any wrapper they need (a container, a database) | test configuration, `test_dirs` from `inventory`, CI files, dev scripts |
| Declared groupings of the code: packs, workspaces, ownership | packwerk `package.yml`, Nx `project.json`, workspace manifests, `CODEOWNERS` |
| Persistent state: databases, ORM models, migrations, file stores, caches, queues | `migration_dirs` from `inventory`, ORM configuration, model folders, queue and cache clients |
| Calls to third parties: HTTP clients, SDKs, webhooks received | the dependency manifests, imports of HTTP clients and SDKs, webhook routes |
| Conventions the code follows: lint and format configuration, error types, logging | lint configs, shared error and logging modules |
| An existing ***plain project | `plain_files` from `inventory`, `plain/config.yaml` |

On a large host, give each top-level area to a fresh read-only agent with this table and steps 3 to 5, and keep only the candidates and evidence it returns.

## 3. Find candidate units

A candidate qualifies only if all four hold:

1. **It is a set of path prefixes.** Folders or whole files. A unit never owns part of a file.
2. **It has an interface.** The functions, classes, routes, commands, or messages through which the rest of the host uses it. Record each entry point with file and line. A registration point outside the unit's paths (a registry entry, a driver map, discovery by file name) is part of the interface; its file goes in the boundary.
3. **The rest of the host goes through that interface.** Search for references from outside its paths into its symbols. Every reference that bypasses the interface is a **leak**; record it with file and line and one kind: `boot` (read when the host loads), `registry` (names a class or constant), `test pin` (a host test that names a class, doubles a signature, or reaches a private member through `send` or reflection — note which), or `call` (calls past the interface). Search the host's tests as well as its code: test pins are the easiest leaks to miss.
4. **Its behavior can be observed through the interface.** The host's tests exercise it, or a test could call the interface and check the result.

A part that is already the render of an existing `.plain` module (its folder has an install manifest, or the module names its paths) is not a candidate: record it with fit `low` and the reason "adopt the module that renders it". A candidate described by an existing module under another name is still a candidate; note the module, and pick a module name that does not collide with it.

Find candidates in the host's own structure, not in a template:

- Start from the folders in `inventory` and the wiring found in step 2: plugin folders, registries, route mounts, dependency-injection modules, workspace packages, services in a compose file.
- For each, follow inbound references (who calls it) and outbound references (which host symbols it uses). Outbound references to host code become its **boundary**.
- Code that talks to a third party (clients, adapters, integrations, webhook handlers) often makes a clean candidate: one interface toward the host, one toward the provider.
- The whole host is a candidate when it has an interface: how it is started and called.

## 4. Arrange the candidates in levels

Candidates nest. Build a tree in which each candidate's parent is the smallest candidate whose paths contain all of its paths.

- Name each level with the host's own word for it — the folder or concept the host uses ("service", "integration", "middleware", "job", "package"). Never impose a fixed set of levels.
- Declared groupings (packs, workspaces) give the level names and the semantic parent of a candidate that lives apart from it. Derive paths from the code, never from a declared membership list: those go stale.
- Levels differ per host: a monolith may have host, module, component; a monorepo has its workspace packages; a plugin host has its plugins.
- Keep a candidate only if it adds a real choice: drop a parent whose only content is exactly one child, not counting metadata files such as manifests.

## 5. Record the evidence of each candidate

For each candidate, record (field names in `references/manifest.md`):

- **id** — kebab case, derived from the path of its main entry file (for example `lib-integrations-drivers-hris-bamboo-hr` from `lib/integrations/drivers/hris/bamboo_hr.rb`), so a later scan of a moved `HEAD` keeps the id of a unit that did not move, even when the unit spans sibling folders.
- **level** and **parent** — the host's name for its level, and the id of its parent.
- **paths** and **exclude** — the prefixes it owns, and prefixes under them it does not own.
- **interface** — entry points, each with file and line.
- **boundary** — host files it depends on: base classes, interfaces it implements, shared helpers, configuration, models it reads.
- **leaks** — references that bypass the interface, each with file and line.
- **tests** — the test files that exercise it and the command that runs only them, with any wrapper it needs.
- **state** — `stateless`, or every piece of state it writes and reads back: tables it defines or migrates, files, a queue, topic, or cache keyspace, and keys inside a record the host owns (a JSON configuration column). Keys in a host-owned record are state too: they are a contract shared with the host.
- **third_parties** — the providers it calls.
- **size** — files and lines, from `inventory --paths <its paths>`, plus the lines of the host base classes whose behavior it inherits.
- **fit** — `high`, `medium`, or `low`, with the one reason that decides it.

## 6. Rank and recommend

Order the candidates by:

1. fit with the Phase 0 intent;
2. fewer leaks;
3. less behavior inherited from host code outside it (a small base contract beats a large base class);
4. covered by the host's tests;
5. stateless;
6. size — smaller first, but not so small that regenerating it is pointless.

Recommend exactly one. Lower the fit, and say why, when a candidate is:

- **stateful** — capture does not migrate state, so the candidate is capturable only if its schema, migrations, stored data, and the host-owned records it writes into stay in the boundary;
- **leaky** — Phase 2 will ask about each leak;
- **untested** — verification in Phase 4 then rests on new conformance scenarios alone;
- **very large** — it will be captured as several modules joined by `requires`, at a matching cost in rendering.

## 7. Record the scan

Create `plain/` if it does not exist. Write `scan` to `plain/capture.json`: `commit` set to `HEAD`, and `candidates` in ranked order, in the shape `references/manifest.md` gives. Keep `units` as it is.
