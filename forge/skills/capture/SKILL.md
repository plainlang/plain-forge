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

User needs to define what to capture (capture target): a component, module or a layer inside application or the whole application. Capture target must be a part of the codebase in the current project. If the target is an external library, stop and report to the user that capture target needs to be inside this project. If capture is not specified, ask the user to define capture target.

# Step 2: Analyze capture target's code and tests

Analyze the source code, its architecture and distill main modules of the capture target, and how modules interact with each other. The ideal module is a deep module that have narrow well-defined interface with lots of functionalities.

Prepare a plan, a structure how to map modules into .plain specs. Present this to the user as a composition chart and wait for confirmation. Then write it as a **capture plan**: a sequence of specs and what modules they represent, and how are they compose into final **top-level spec**. 

Analyze the test code of capture target's, what kind of tests are present, where they reside. Especially note high-level end-to-end tests, which can later be used evaluate the rendered code. 

Capture shared tech stack by writing implementation and test requirements inside an `import` .plain spec (base spec), which can be reused by most .plain specs.

# Step 3: Capture target's top-level boundary

Top-level boundary of the capture target is either:
* User interface (UI) if capture target is application
* public API if capture target is code component

Analyze the top-level boundary of the capture target extracting main behaviour and functionalities by:
- reading source code
- reading high-level tests
- running the code in isolation

Write a **top-level spec** (the top `.plain` module) that defines the interface and functionalities of the capture target in detail. The code generated from this top-level spec should be able a drop-in replacement for the current code (capture target) without any additional adjustments necessary. Read the target's original tests, which show the contract. Note every test case. Write test scenarios for **top-level spec**.

## Step 4: Capture complete target's behaviour

Go through every spec in **capture plan** from bottom to the top. The final **top-level** spec is already written, but review it through the same procedure, and revise if necessary.

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
