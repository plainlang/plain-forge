# Rendering and testing workflow

## Incremental rendering

Functional specs render from top to bottom. When rendering one functional spec, the renderer knows
the previous specs but not future specs. A base module's functional specs also count as previous
specs according to the module rules.

Each functional spec receives its own conformance-test folder. After a new spec renders, the
renderer runs conformance tests for previous specs to detect regressions. A new failure can mean:

1. The generated implementation does not satisfy the specification.
2. The generated conformance test does not accurately test the specification.
3. The new and previous specifications conflict.

Diagnose which case applies, then correct the `.plain` source. Use the dedicated conflict-analysis
and debugging skills rather than editing generated output.

## Generated artifacts are read-only

Everything under `plain_modules/` is generated — both `<module>/code/` and `<module>/tests/`. It may be read, executed,
and debugged, but never edited directly. Apply fixes as follows:

- Behavior or implementation/unit-test guidance: edit definitions, functional specs, or
  implementation requirements as appropriate.
- Conformance-test guidance: edit test requirements.
- Acceptance-test guidance: edit the acceptance tests nested under their owning functional spec.

Re-render after correcting the source specification.

## Test-script roles

Test scripts are renderer entry points as well as developer utilities:

- `run_unittests_<lang>` receives the generated build folder and runs the complete generated unit
  suite. It is self-contained and does not depend on environment preparation.
- `prepare_environment_<lang>` optionally prepares a reusable system-temporary environment for
  conformance testing once per render.
- `run_conformance_tests_<lang>` receives the generated build folder and one functionality's
  conformance-test folder (`plain_modules/<module_name>/tests/<functionality>`). It may run repeatedly during a render.

Invoke the corresponding `implement-*-script` skill when creating or changing a test script. Those
skills own exact staging, cleanup, dependency-installation, shell, and exit-code contracts.

## Common invocation shape

Run project scripts from the repository root, using the filenames configured for that project:

```bash
./test_scripts/run_unittests.sh plain_modules/<module_name>/code
./test_scripts/prepare_environment.sh plain_modules/<module_name>/code
./test_scripts/run_conformance_tests.sh \
  plain_modules/<module_name>/code plain_modules/<module_name>/tests/<functionality>
```

The renderer resolves script arguments to absolute paths. Test scripts must treat input directories
as read-only and stage writes in their designated system-temporary working directory.
