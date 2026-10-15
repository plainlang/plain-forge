# Phase 2 — What technologies should it use?

Gather the technical stack **and** the project's structure/architecture. This phase affects only `***implementation reqs***` — testing concerns come later. Phase 1 may already have left technology-free policy reqs there (retries, error handling, data formats); read them before topic 1, and revisit one only where the chosen stack contradicts it or supplies it natively. Run the core loop (ask → author → review) from `SKILL.md` for each topic below, in order. When the user has no preference, propose a sensible default that fits earlier answers and ask them to confirm.

## Author target for this phase

Write each requirement into `***implementation reqs***`:

- Shared, stack-wide reqs (language, framework, architecture, coding standards) go on the template module if one exists.
- Module-specific reqs (e.g. a data-storage choice or an external integration only one module uses) go on the module that needs them.

Do **not** add `***test reqs***` or test plain files in this phase — they belong to later phases.

## Topics (in order)

1. **Programming language** — e.g. Python, TypeScript, Java, Go. Author a language requirement at the appropriate scope (template if shared across modules, otherwise on the module). Review that requirement snippet.
2. **Frameworks** — e.g. Flask, FastAPI, Next.js, Spring Boot, Express, React, Vue. Author framework requirement(s) and any framework-specific architectural conventions. Review the new framework reqs.
3. **Data storage** — e.g. PostgreSQL, SQLite, file-based, in-memory, none. Author a storage requirement on the module that owns persistence (or the template if shared). Review that snippet.
4. **External services or APIs** — anything the app talks to: auth providers, payment gateways, email/SMS, third-party APIs, internal services. Author one requirement per integration on the module that uses it. Review each integration snippet.
5. **Project structure & architecture** — the architectural style and the layers/components the project should be organized into (managers, services, models, repositories, controllers, views, adapters, DTOs, …). Discuss naming conventions, directory layout, and the responsibilities/boundaries of each layer. If the user has no preference, propose a layout that fits the language, framework, and feature set, and confirm it. Author architecture/layering reqs in the template (if shared) and any module-specific deviations on the module. Review the architecture reqs and the resulting layer split.
6. **Other constraints** — deployment target, OS requirements, performance needs, coding standards, security policies, observability — anything stack-wide that hasn't already been covered. Author each constraint as its own requirement at the appropriate scope. Review the new constraint snippets.
7. **Anything else** — anything the user wants to add or change that hasn't already been covered.

When all topics are complete, summarize the full tech stack and the chosen architecture, and get an explicit overall confirmation before moving to Phase 3.
