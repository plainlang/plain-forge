---
name: add-resource
description: >-
  Add a linked resource (external file reference) to a ***plain spec. Use when
  the user wants to reference a JSON schema, API spec, data file, or other
  external file from within a functional spec, definition, or implementation
  requirement.
---

# Add Resource

Always use the skill `load-plain-reference` to retrieve the ***plain syntax rules — but only if you haven't done so yet.

Linked resources are external files referenced from within a `.plain` spec using markdown link syntax. The file contents are passed to the renderer alongside the spec, providing additional context for code generation.

## Workflow

1. **Identify or create the resource file.** Keep it inside the project — the `resources/` directory is the conventional home; it does not have to sit next to the `.plain` file.
2. **Add the markdown link** at the appropriate place in the spec.
3. **Verify the file path** is relative to the `.plain` file location.
4. **Read the file back** to confirm correct link syntax and path.

## Format

Use standard markdown link syntax inside any spec section:

```plain
***definitions***
- :AuthData: is the authentication data structure.
  - Its format is defined in the [auth schema](resources/auth_schema.json).

***implementation reqs***
- When transforming :BackupData:, use the JOLT transform.
  - The transform is defined in [backup_transform.jolt](resources/backup_transform.jolt).

***functional specs***

- An API conforming to the [API specification](resources/api_spec.yaml) is exposed.
```

## Path Rules

- Paths are resolved **against the directory that contains the `.plain` file**, not the directory where `codeplain` is run.
- A path that does not resolve there is then looked up in the `--template-dir` directory (if given), and last in the built-in `standard_template_library`.
- Relative paths may traverse into parent directories — `[resource](../../resources/resource.md)` is valid — as long as they resolve to a real text file on disk.
- **No external URLs** — only local file references.
- **No folder paths** — the target must be a file, not a directory.
- Only text-based files are supported.

### A linked resource MUST be a single, text-based file that exists on disk

A linked resource is **always** a single file that exists on disk at the path you reference, **and** that file's content must be text-based. The renderer reads the linked file's bytes and feeds them into the model alongside the spec; a directory, a remote URL, or a binary blob breaks that contract and is one of the most disruptive mistakes you can make when authoring a `.plain` file — the spec looks valid but the renderer either silently ignores the link, fails to read it, or wastes the model's context window on bytes it cannot interpret.

Three things a linked resource **must not** be:

1. **A folder / directory.** `[integrations](src/integrations/)`, `[schemas](resources/schemas/)`, `[host project](../host_project/)` are all invalid — the renderer cannot ingest a directory. If a whole directory's worth of content is relevant, pick the single most representative **file** inside it (a `README.md`, an exemplar source file, a manifest at the directory root) and link **that**.
2. **A URL / external location.** `[Stripe docs](https://stripe.com/docs/api)`, `[OpenAPI spec](https://example.com/openapi.json)`, any `http://` / `https://` / `ftp://` / `git://` / `s3://` / `gs://` target. Linked resources are local-file only. If a URL's content is essential to the spec, fetch it once, save the response to a text file under `resources/` (e.g. `resources/stripe-docs-snapshot.md`, `resources/example-openapi.yaml`), and link **that file**.
3. **A binary file.** PNG, JPG, JPEG, GIF, BMP, TIFF, WebP, ICO, PDF, DOCX, XLSX, PPTX, ZIP, TAR, GZ, MP3, MP4, WAV, compiled binaries (`.exe`, `.so`, `.dylib`, `.class`, `.wasm`), and anything else that isn't human-readable text in its raw form. Binary content cannot be meaningfully consumed by the renderer; linking a screenshot, a PDF spec, or a packaged artifact accomplishes nothing except bloating the context. If the information in a binary asset is essential, transcribe it into a text-based form first — a UI screenshot becomes a Markdown description or a structured YAML wireframe under `resources/`; a PDF spec becomes a Markdown extract or the underlying JSON Schema / OpenAPI; an architecture diagram becomes a Mermaid block inside a Markdown file.

If the markdown-link target ends with `/`, contains `://`, points at a path that resolves to a directory, or points at a file with a binary extension (see the list above), **stop** — it cannot be a linked resource. Convert it to a text file under `resources/` first, then link the converted file.

### Do not mention URLs or folder paths in `.plain` content at all

The constraint above is **not** just about markdown link syntax. URLs (any `http://`, `https://`, `ftp://`, `git://`, `s3://`, … string) and folder paths (`src/integrations/`, `../host_project/`, anything ending with `/`, anything that resolves to a directory) **must not appear anywhere in `.plain` content** — not as link targets, not in concept body prose, not in functional-spec text, not in implementation-reqs. Mentioning a URL or a folder in prose is a critical and common mistake because:

- The renderer cannot follow URLs or open folders. A URL or folder reference in prose is a *ghost* dependency: it looks meaningful to a human reader, but it contributes nothing to code generation. Worse, downstream readers (and future you) assume the renderer used the referenced content, so the spec drifts from reality.
- The fix is always the same: if external content matters, fetch it (or pick one canonical file out of the directory), save it as a text file under `resources/`, and refer to it through a normal linked resource. The concept or spec then names the content through the linked file, not through a URL or folder path string.

The **only** exceptions are URLs and paths that are *values the produced software itself uses at runtime* (e.g. the base URL the integration calls, a database connection path, a CLI argument value). Those are configuration values, not external references, and they belong in the spec because the generated code needs them. A useful litmus test: "Would the renderer benefit from reading the bytes at this URL / folder?" If yes, save it to a text file and link the file. If no (it's a runtime value), it can stay as plain text in the spec.

### What a linked resource CAN be

- A single file inside the project, reachable by a path relative to the `.plain` file — parent-directory traversal (`../`) is allowed (`resources/` is the conventional home).
- A **text-based** file the renderer can read end-to-end: JSON, YAML, XML, HTML, Markdown, plain text, CSV, TSV, source code in any language (`.py`, `.js`, `.ts`, `.go`, `.java`, `.rb`, `.rs`, `.kt`, `.swift`, `.c`, `.cpp`, `.cs`, …), shell scripts, SQL, JSON Schema, OpenAPI, AsyncAPI, Protobuf `.proto`, GraphQL SDL, `.jolt`, `.env.example`, `.toml`, `.ini`, `.proto`, `Dockerfile`, etc.

## Common Resource Types

| Type | Typical location | Use case |
|------|-----------------|----------|
| JSON Schema | `resources/*.json` | Defining data structure contracts |
| OpenAPI / Swagger spec | `resources/*.yaml` | API endpoint definitions |
| Data transforms | `resources/*.jolt` | Data transformation rules |
| Test fixtures | `resources/*.json`, `resources/*.csv` | Sample data for tests |
| Configuration examples | `resources/*.yaml` | Reference configurations |

## When to Use Resources

- The information is too detailed or structured to express inline in the spec (e.g., a full JSON schema).
- The same data is referenced by multiple specs or sections.
- The resource is an industry-standard format (OpenAPI, JSON Schema) that the renderer can interpret directly.

## When NOT to Use Resources

- The information is short enough to include inline in the spec text.
- The file is generated code (those belong in `plain_modules/`, not `resources/`).

## Validation Checklist

- [ ] Resource file exists at the specified path
- [ ] **Target is a file on disk, not a directory** (the path does not end in `/` and does not resolve to a folder)
- [ ] **Target is a local path, not a URL** (no `://` anywhere in the target: no `http://`, `https://`, `ftp://`, `git://`, `s3://`, `gs://`, etc.)
- [ ] **Target is a text-based file** (no binary extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`, `.webp`, `.ico`, `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.zip`, `.tar`, `.gz`, `.mp3`, `.mp4`, `.wav`, `.exe`, `.so`, `.dylib`, `.class`, `.wasm`, …)
- [ ] **No URLs or folder paths anywhere in the surrounding `.plain` content** (not as link targets, not in body prose), with the sole exception of URLs / paths that are runtime values the generated software itself uses
- [ ] Path is relative to the `.plain` file, not absolute
- [ ] Path resolves to a real text file on disk relative to the `.plain` file (`../` traversal is allowed)
- [ ] Markdown link syntax is correct: `[display text](relative/path)`
- [ ] Resource content is relevant and adds value beyond what the spec text says
