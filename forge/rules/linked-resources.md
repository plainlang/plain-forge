---
description: Rules for linking external resources from .plain specs
---

# Rules for linked resources in `.plain` files

Specifications can reference external files using markdown link syntax. The renderer reads the linked file's bytes verbatim and feeds them to the model alongside the spec. That mechanism only works for a specific shape of target — violating any of the rules below is one of the most common and disruptive mistakes in `.plain` authoring.

## Hard constraint: a linked resource is always a single, text-based file on disk

A linked resource **must not** be any of the following:

1. **A folder / directory.** `[integrations](src/integrations/)`, `[host project](../host_project/)` are invalid — the renderer cannot ingest a directory. Pick the single most representative file inside (a `README.md`, an exemplar source file, a manifest) and link **that**.
2. **A URL / external location.** `[Stripe docs](https://stripe.com/docs/api)`, any `http://` / `https://` / `ftp://` / `git://` / `s3://` / `gs://` target. Linked resources are local-file only. If a URL's content is essential, fetch it once, save the response to a text file under `resources/`, and link the saved file.
3. **A binary file.** PNG, JPG, GIF, PDF, DOCX, XLSX, ZIP, MP3, MP4, compiled binaries (`.exe`, `.so`, `.class`, `.wasm`), and anything else that isn't human-readable text in its raw form. Binary content cannot be meaningfully consumed by the renderer — transcribe it into a text-based form first (a UI screenshot becomes a Markdown description, a PDF spec becomes a Markdown extract or the underlying JSON Schema / OpenAPI, an architecture diagram becomes a Mermaid block).
4. **Another `.plain` file.** `[Auth Module](auth.plain)` is invalid. To reference another module, use the `require` or `import` frontmatter directives. Do not link it as a markdown resource; the renderer will flag this as a syntax error.

## Never use a URL or folder path as a *reference* in prose
- The hard constraint above is enforced only on markdown links. A bare URL or folder path in prose (concept body, functional-spec text, implementation reqs, test reqs) passes validation and is fed to the renderer verbatim as part of the spec text
- That is exactly why it is dangerous as a *reference*: the renderer cannot fetch the URL or open the folder, so the model sees only the address, not the content behind it. To a human reader the line looks grounded in a source; to the renderer it is a *ghost dependency*, and the spec silently drifts from whatever the URL actually says
- A URL or path in prose is fine when the *text itself* is the complete fact:
  - **Runtime values** the produced software uses — the base URL an integration calls, a database connection path, a CLI argument default, an output directory layout
  - **Provenance notes** for a snapshotted resource — recording the canonical URL a file saved under `resources/` was fetched from
- Litmus test: "Would the renderer benefit from reading the bytes at this URL / folder?" If yes, save it to a file and link the file. If no (the address itself is the fact), it can stay as plain text

## Structured protocol artifacts must be linked, never transcribed
- JSON Schema, OpenAPI / Swagger, GraphQL SDL, Protobuf `.proto`, Avro / Thrift schemas, XML XSDs, AsyncAPI specs, JSON-RPC method definitions, wire-protocol descriptions, payload examples — anything with a formal machine-readable shape — belongs in a file under `resources/` (or another directory within the project)
- The spec line should describe the *role* of the artifact ("the request body conforms to ...", "the public API surface is defined in ...") rather than its contents
- Reasons: one source of truth (no drift between prose and schema); the renderer and the generated code can both consume the file directly; schema changes show up cleanly as diffs

```plain
***definitions***

- :TaskCreateRequest: is the JSON payload for creating a task.
  - It is defined by [resources/task_create_request.schema.json](resources/task_create_request.schema.json).
- :TasksAPI: is the public HTTP surface for tasks.
  - It is defined by [resources/tasks_openapi.yaml](resources/tasks_openapi.yaml).

***functional specs***

- A :User: can add a :Task: by POSTing :TaskCreateRequest: to the `POST /tasks` endpoint of :TasksAPI:.
  - The endpoint responds per :TasksAPI:.
```

## Each linked resource is referenced from exactly one place
- Linking the same file from two functional specs (or from a functional spec **and** an implementation requirement) creates two independent sources of truth — any later edit silently diverges
- If a resource needs to inform multiple parts of the project, **don't repeat the link** — attach the resource to a **concept** in `***definitions***` and reference the concept token (`:ConceptName:`) elsewhere
- If you're about to paste the same `[name](path)` link a second time, **stop** — create the concept first

```plain
***definitions***

- :TaskModalSpec: is the user-interface contract for the task modal.
  - It is fully described in [task_modal_specification.yaml](task_modal_specification.yaml).

***functional specs***

- A :User: can add a :Task: using :TaskModalSpec:.

- A :User: can edit a :Task: using :TaskModalSpec:.
```

## File location and path resolution
- Paths are resolved against the directory that contains the `.plain` file, not the directory where `codeplain` is run
- A path that does not resolve there is then looked up in the `--template-dir` directory (if given), and last in the built-in `standard_template_library`
- Because the `.plain` file's own directory is the anchor, a render gives the same result from any working directory
- Relative paths may traverse into parent directories — `[resource](../../resources/resource.md)` is valid — as long as they resolve to a real text file on disk
- The conventional location is a `resources/` directory next to the `.plain` file
