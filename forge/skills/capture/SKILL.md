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

User needs to define what to capture (capture target): a component, a module or the whole application. If it is not specified or is not clear what the capture target is, ask the user.

Capture target must be a part of the codebase in the current project. If the target is an external library, abort capture and report back to the user.

# Step 2: Prepare capture plan

Analyze the source code with tests and infer the main code modules of the capture target. The ideal module is a deep module that have small interface with lots of functionalities. Analyze how main modules interact with each other, and which depends on which. Ideally, there are no bidirectional dependencies (cycles).

Prepare a plan how to map modules into .plain specs. Present it to the user as a composition chart and wait for confirmation. Then write this plan as a **capture plan**: a sequence of .plain specs with definition what code modules each spec represents. The final .plain spec is the **top-level spec** which represents the **top-level module**.

# Step 3: Capture target's boundary and top-level module

Target's boundary consists of all of target's entry points and their observable outputs, for example:
* if capture target is a web/desktop application: User interface with all user messages, buttons, forms, designs, etc.
* if capture target is a CLI application: CLI interface with all commands, arguments, messages, error messages, results, etc.
* if capture target is a code component: public API with all public signatures, types, constants, etc.

All these observable outputs of the boundary should be catalaged in resources and linked inside spec in order to keep the spec concise and readable.

First analyze the top-level module by:
* reading source code
* reading high-level tests
* running the code in isolation

Write a .plain spec for **top-level module** that describes the boundary and all functionalities of the capture target in detail, but without internal implementation details. The code generated from spec should be able a drop-in replacement for the capture target's code without any additional adjustments necessary. Note every functionality and every test case and write test scenarios for **top-level module**.

Write an `import` .plain spec (base spec) for shared tech stack by writing implementation and test requirements. This base spec can be reused by other .plain specs.

## Step 4: Capture target's complete functionalities

Go through every spec in **capture plan**. The final **top-level spec** is already written, but review it at the end and revise if necessary.

For every spec:
* Analyze source code and tests of modules it represents from capture target
* Focus on behaviour and functionalities
* Write a `.plain` module along base spec and top-level spec, with all test scenarios for all the functionalities
* Add functionalities only through `add-functional-specs` (or `add-functional-spec` for a single one). Write concepts with `add-concept` and requirements with `add-implementation-requirement` or `add-test-requirement`.

While writing:
* Capture failure paths, not only the happy path: errors, what still runs on failure or partial failures.
* Keep the contract apart from internals. The contract is what callers observe: exports, results, errors, side effects on files and processes. Test specs check only the contract, never internal helpers, so they hold for the original code too.

## Step 5: Check the specs against the original

1. **Test coverage map.** List every original test case with the spec or test scenarios that covers it. Close each gap, or mark it as left out with a reason.
2. **Test scenarios hold for the original.** Every expected result in the test scenarios must be true of the original code. When unsure, check by running the original.

Finish with `plain-healthcheck`. Report what was captured, the coverage map, and any behavior left out.
