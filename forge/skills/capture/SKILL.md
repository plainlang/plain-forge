---
name: capture
description: >-
  Use when asked to capture component, module, a layer of functionalities or whole app
  into ***plain specs.
---

# Before Capture

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

## Where specs live

Specs go where the governing `config.yaml` puts them (e.g. `plain/config.yaml`):

- Modules sit in the directory of that `config.yaml`.
- Import modules go under its `template-dir`.
- Test plain files go under its `tests-folder`.
- Linked resources go in `resources/` next to the modules.

Find the existing `config.yaml` before writing. If there is none, ask the user where specs should
live, then create it there with `init-config-file`.

# Step 1: Define capture target

User needs to define what to capture (capture target): a functionality, component, module or a layer inside application or the whole application. Capture target must be a part of the codebase in current project. If the target is an external library, stop and report to the user that capture target needs to be inside this project. If capture is not specified, ask the user to define capture target.

# Step 2: Analyze capture target's boundaries

Analyze the source code of the capture target and how it interacts with the rest of the codebase. The ideal capture targets are deep modules that have narrow and well-defined interface with lots of isolated functionality inside.

Analyze the boundaries of the capture target:
* The top-level interface of the target (API of code module or UI of the application)
* The bottom seam that defines how the target is using the rest of the code or external tools and libraries.

For the top interface, write a draft **top-level spec** (the top `.plain` module) that defines the interface of the capture target in great detail. The code generated from this top-level spec should be able a drop-in replacement for the current code (capture target) without any additional adjustments or modifications necessary.

For the bottom seam, write a draft **base spec** (an import `.plain` module) that defines in implementation requirements all the internal codebase as well as external dependencies needed for rendering the capture target.

Both top-level spec and base spec need to be captured in great detail, so that capture target's code can be drop-in replaced with regenerated code from specs.

## Step 3: Analyze capture target architecture

Analyze the capture target code components and how they connect, tech stack and architectural choices. Map the source code architecture of the capture target to the .plain spec modules and present it to the user. Propose a module layout that mirrors the code's modules:

- Build it along base spec and top-level spec
- Shared tech stack and concepts: an `import` module.
- Each code module: one `.plain` module; dependencies between them: a `requires` chain.
- Per module: its concepts, implementation reqs, and the list of functionalities.

After it is confirmed, write all .plain spec files as draft placeholders, without functionalities.

## Step 4: Write the .plain specs functionalities

Write each module per the confirmed structure, in dependency order. Start by reading the draft spec placeholder and adding to it.

Add functionalities only through `add-functional-specs` (or `add-functional-spec` for a single one). Write concepts with `add-concept` and requirements with `add-implementation-requirement` or `add-test-requirement`.

Make sure that the last spec to write is the top-level spec of the capture target with very detailed interface.

Finish with `plain-healthcheck` and report what was captured and any behavior left out.
