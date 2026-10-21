---
name: create-import-module
description: >-
  Create a ***plain import module that provides shared definitions,
  implementation reqs, and test reqs for other modules to import. Use when
  the user wants to create a new .plain file that contains only definitions,
  implementation reqs, and/or test reqs — no functional specs.
---

# Create Import Module

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## What an Import Module Is

An import module is a `.plain` file that lives in the **`template/`** directory and contains **only** `***definitions***`, `***implementation reqs***`, and/or `***test reqs***`. It must **not** contain `***functional specs***` and must **not** use `requires` in its frontmatter. Other modules pull in its content via the `import` field in their YAML frontmatter, gaining access to its definitions and reqs.

Use import modules for:
- Sharing concept definitions across multiple modules
- Providing common implementation requirements (e.g., technology stack, coding standards)
- Providing common test requirements
- Creating reusable foundational structure (templates)

If the module needs functional specs (i.e., it describes what software should do), it is not an import module — see the `create-requires-module` skill.

## Workflow

1. **Determine what shared content this module should provide** — which definitions, implementation reqs, or test reqs will other modules need?
2. **Create the `.plain` file in the `template/` directory** with YAML frontmatter. Use `required_concepts` to declare concepts that importing modules must define. It may optionally `import` other templates for layered reuse, but must **not** use `requires`.
3. **Add the shared content** — definitions, implementation reqs, and/or test reqs.
4. **Do not add `***functional specs***`** — import modules must not contain functional specs.
5. **Verify concept availability** — ensure all `:Concepts:` referenced are either defined in this module, provided by its own imports, declared as `required_concepts`, or are predefined concepts.

## Format

The `import` field is a list of module paths in the YAML frontmatter:

```plain
---
import:
  - base_template
required_concepts: [":AppName:"]
description: Shared API definitions and reqs
---

***definitions***

- :ApiClient: is the HTTP client used to communicate with external services.

- :ApiResponse: is the response returned by :ApiClient:.

***implementation reqs***

- :Implementation: should handle HTTP errors by raising appropriate exceptions.

- :ApiClient: should support configurable timeouts.

***test reqs***

- :ConformanceTests: should mock all external HTTP calls made by :ApiClient:.
```

The default import directory is `template/` — the `template/` prefix is not needed in import paths. The `.plain` extension is omitted. Note the absence of `***functional specs***` — import modules must not have them.

## Satisfying Required Concepts

If an imported template declares `required_concepts`, the importing module **must** define those concepts in its own `***definitions***` section:

```plain
---
import:
  - auth_template
---

> auth_template declares required_concepts: [":AuthSchema:", ":AuthApiSpec:"]
> So this module must define them:

***definitions***

- :AuthSchema: is the JSON schema describing the authentication data structure.

- :AuthApiSpec: is the OpenAPI specification for the external service's auth endpoint.
```

## Import vs Requires

| Aspect | `import` | `requires` |
|--------|----------|------------|
| Pulls in definitions | Yes | No (only `exported_concepts`) |
| Pulls in implementation reqs | Yes | No |
| Pulls in test reqs | Yes | No |
| Pulls in functional specs | No | Yes (as previous requirements, transitively) |
| Copies generated code | No | Yes (accumulated ancestor chain) |
| Typical use | Templates, shared definitions | Attaching a module to the build chain |

## Validation Checklist

- [ ] Module file is in the `template/` directory
- [ ] Module does **not** contain `***functional specs***`
- [ ] Module does **not** use `requires` in its frontmatter
- [ ] Contains at least one of: definitions, implementation reqs, or test reqs
- [ ] All `required_concepts` from any imports this module itself uses are satisfied
- [ ] `required_concepts` declared for any concepts referenced but not defined here
- [ ] No concept name collisions between this module's imports and local definitions
- [ ] YAML frontmatter is correctly formatted between `---` markers
