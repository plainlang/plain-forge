---
name: capture
description: >-
  Captures an existing codebase (the host) as ***plain specs, one unit of regeneration at a time,
  and keeps those specs in step with the host. Scans the host read-only, discovers the units it can
  be regenerated in, nested at levels the host itself defines, and lets the user choose one; then
  writes that unit's behavior as .plain modules, its boundary as a host context import module, and
  a capture manifest (plain/capture.json) recording what was captured at which commit. Idempotent:
  a re-run on an unchanged host writes nothing, and a re-run after the host changed flags every
  change to the unit's code or boundary for review instead of absorbing it. Use when the user wants
  to bring existing code under ***plain, asks which parts of a codebase can be regenerated, runs
  /capture, or wants captured specs re-checked after the host changed. Not for a project with no
  code yet (use forge-plain) or for adding a feature to existing specs (use add-feature).
---

# Capture

**Load the rules first.** Before you read, edit, or write any `.plain` file, invoke the `load-plain-reference` skill and read the rule files it routes you to. Skip this only if `load-plain-reference` already ran in this conversation.

`capture` turns code that already exists into `***plain` specs. It answers three questions in order: which parts of this host can be regenerated, which one does the user want, and what does that part do today. Once captured, the specs are the source of truth for that part; every later run checks that the host still agrees with them.

## Terms

- **Host** — the existing codebase, rooted at its git work tree. Everything outside the chosen unit stays hand-written and keeps changing.
- **Unit of regeneration** — a part of the host that can be described in `.plain`, rendered, and put back without the rest of the host noticing. It has paths (the files it owns), an interface (what the rest of the host calls), and a boundary (the host files it depends on).
- **Level** — the host's own nesting of units: a unit can contain smaller units. Levels are discovered per host, never taken from a fixed list.
- **Capture manifest** — `plain/capture.json`: the cached scan, every captured unit, and the hash and commit of each file a unit owns or depends on. Read `references/manifest.md` before writing it.

## Ground rules

1. **Never change host code.** `capture` writes only inside `plain/`. A change to host code that disagrees with the specs is flagged for the user, never fixed, reverted, or formatted.
2. **Describe the code as it is at the captured commit.** Capture behavior, not intent, and not what documentation claims. Behavior that looks unintended is put to the user; it is never silently corrected or left out.
3. **Ground every fact in a file.** Each unit, interface, boundary file, and functional spec carries the file (and line, where one applies) it came from. Never infer behavior from names alone.
4. **Write through the authoring skills.** Every `.plain` write goes through `add-concept`, `add-functional-specs`, `add-implementation-requirement`, `add-test-requirement`, `add-test-scenarios`, `create-import-module`, or `create-requires-module`. Never hand-author a section.
5. **Converge.** The same commit and the same manifest produce the same candidates, the same specs, and no writes. Before writing a concept, func-id, or module, look for it on disk and continue from it instead of adding a second one.

## The state script

`scripts/capture-state.mjs`, next to this `SKILL.md`, owns everything that must be deterministic. Run it with Node from the host root, giving its full path (for a Claude layout, `node .claude/skills/capture/scripts/capture-state.mjs <command>`):

| Command | Does | Exit |
|---|---|---|
| `inventory [--depth <n>] [--under <folder>]` | Prints host facts at `HEAD` as JSON: commit, folders two levels deep (or `--depth`) with file and line counts, dependency manifests, test and migration folders, CI files, existing `.plain` files. `--under` narrows it to one folder, for drilling into a large host. | `0` |
| `status [--unit <id>]` | Compares each captured unit with its recorded hashes and prints every change, classified, plus every copy under `plain/resources/host/` that no longer matches its host file. Writes nothing. | `0` all up to date, `1` something needs attention |
| `snapshot --unit <id> [--revert] [--paths <p>...]` | Records the current hashes of the unit's files, or only of `--paths`. Advances `last_captured` to `HEAD` once every file matches its record. | `0` |

Exit `2` means a usage, git, or manifest error; read stderr, fix the cause, and run it again. Never edit `files`, `decisions`, `last_captured`, or `status` in the manifest by hand — `snapshot` owns them.

## Step 0 — Choose the mode

1. Find the host root with `git rev-parse --show-toplevel`. If the working directory is not in a git work tree, stop: capture needs commits to compare against. Tell the user to initialize git and commit the host first.
2. Read `plain/capture.json` if it exists, and pick the mode:
   - **No manifest** → first capture: Phases 0 to 5.
   - **A unit with `"status": "capturing"`** → resume it: continue from the first phase whose output is missing on disk.
   - **Captured units, and the user did not ask for a new unit** → re-capture: read `references/recapture.md` and follow it.
   - **The user asks to capture another unit or to see the units again** → Phase 1, then Phases 2 to 5 for the new unit.
3. If `plain/` already holds a ***plain project without a manifest, adopt it: new modules go next to the existing ones, and nothing existing is moved or renamed.
   - Run `plain-parser check` on each existing top module before writing anything. Record every failure as pre-existing, show the list to the user, and ask whether to proceed. Capture does not fix modules it did not write.
   - If an existing import module holds only host-wide facts (stack, conventions, unit-test policy), it is the host context: Phase 3 updates it instead of creating `template/host_context.plain`. An import module that also carries rules for other modules is left as it is; Phase 3 creates `template/host_context.plain` beside it, and the final report names the facts the two share.
   - If the existing test scripts cannot stage the unit's paths into the host, the unit gets its own part folder, `plain/<module>/`, with its own `config.yaml`, `test_scripts/`, and `tests/`, sharing `plain/template/` and `plain/resources/`; the existing ones are not changed.

## Phase 0 — Intent

Ask one question: what the user wants to be able to regenerate, and why (for example "replace our hand-written Stripe client", "make the importer regenerable before we rewrite it"). Skip it when the request already says so; restate the intent in one line instead. Write nothing to disk. The intent ranks candidates in Phase 1; it does not limit what is scanned.

## Phase 1 — Scan the host

Read `references/phase-1-scan.md` and follow it. It runs `inventory`, reads the host, discovers the candidate units and their levels, ranks them against the intent, and records the scan in the manifest. If the manifest already holds a scan of the current `HEAD`, reuse it and do not scan again.

If `inventory` reports uncommitted files, tell the user the capture describes `HEAD` and that uncommitted work is not part of it. Recommend committing first.

## Phase 2 — Choose the unit

1. Show the discovered levels as a tree, each candidate with its level name, paths, and fit. Then ask one `AskUserQuestion` with the recommended candidate first (marked "Recommended") and up to three alternatives, each with a preview of:
   - its position in the tree;
   - the paths it owns and the files in its boundary;
   - its interface (entry points with file and line);
   - its tests, its state (stateless or what it owns), and the third parties it calls.
2. If the chosen candidate has **any state** — tables, files, queues, or keys it writes into a host-owned record (see *state* in `references/phase-1-scan.md`) — tell the user that capture does not migrate state: the schema, the stored data, and the host-owned records stay with the host. Ask whether to proceed with the state kept in the boundary, or to pick the nearest stateless candidate. If the state cannot stay in the boundary, do not capture it.
3. If the chosen candidate has **leaks** (host code that reaches past its interface), ask one question per kind of leak (`boot`, `registry`, `test pin`, `call`), listing every leak of that kind: widen the unit to include the leaking code, or treat the leaked names and signatures as part of the interface. Offer widening only when the leaking code sits in files the unit can own whole — a unit never owns part of a file — and name those files in the option; a leak in a file shared with other concerns (an initializer that configures every provider) can only become interface. For `test pin`, say whether host tests also reach private members (through `send` or reflection): pinning those pins the private names and the branches only they reach.
4. If the host already tests the unit, ask where the rendered `:UnitTests:` go: a separate folder (recommended — the host's own tests stay, join the boundary, and keep checking every render), or over the host's tests (they join the unit's `paths`, and a render replaces them).
5. Add the unit to `units` in the manifest with `"status": "capturing"`, its `id`, `module` (the root `.plain` module name), `paths`, `exclude`, and `boundary`, as described in `references/manifest.md`.

## Phase 3 — Write the unit as ***plain

Read `references/phase-3-author.md` and follow it. It writes the host context import module, the unit's concepts, functional specs, implementation reqs, and, when conformance tests are on, its test reqs, test plain files, test scripts, and `config.yaml` — each step written to disk immediately and reviewed with the user. It ends by writing the unit's `functionalities` and `render_map` into the manifest.

## Phase 4 — Verify

1. Run `plain-healthcheck`. Fix every `FAIL` item in the `.plain` files, `config.yaml`, or scripts and run it again until `PASS`. An item recorded as pre-existing in Step 0 does not block the capture; report it again at the end.
2. Spawn a fresh `general-purpose` review agent (not a fork). Give it `references/checklist.md`, the paths of every file written, `plain/capture.json`, and an evidence record: each question asked in Phases 0 to 3, its answer, what was written in response, and the `plain-healthcheck` verdict. It returns `APPROVED` or a numbered list of unmet items. Fix each item through the skill that owns it, re-run `plain-healthcheck` if a `.plain` file changed, and spawn a fresh agent again, until one returns `APPROVED`.
3. Ask the user whether to render the unit now and run the host's tests against the rendered code. That run is the evidence that the specs describe the code. A failing test means the specs miss behavior: fix the specs (as `debug-specs` does), never the generated code, and run it again.

## Phase 5 — Record

1. Run `snapshot --unit <id>`. It refuses while files of the unit or its boundary are uncommitted; ask the user to commit them, then run it again. The unit is captured when `snapshot` reports `"settled": true`.
2. Run `status --unit <id>` and confirm `"state": "up-to-date"`.
3. Tell the user what was captured — the unit, the commit, the modules, the number of functionalities, and any behavior written differently from the code at their request — and that `plain/` (including `capture.json`) must be committed for the next run to see it.

## Error handling

- **Not a git work tree, or no commits** → stop; ask the user to initialize git and commit the host.
- **`capture-state.mjs` exits `2`** → read stderr. A malformed manifest is fixed by hand only in the fields `references/manifest.md` marks as hand-edited; anything else is fixed by running `snapshot`.
- **No candidate qualifies** (every part of the host leaks or has no identifiable interface) → report the closest candidates and what disqualifies each; do not force a unit.
- **The chosen unit is too large to review** (the whole host, or hundreds of functionalities) → propose capturing it as several modules joined by `requires`, one per sub-level, and capture them one at a time.
- **The review agent cannot be spawned** → walk `references/checklist.md` inline and tell the user the review was self-run.
- **`plain-healthcheck` returns `FAIL`** → do not record the unit as captured; fix and re-run until `PASS`.

## Question style

- One question per `AskUserQuestion`, standing on its own: name the unit, the file, and the func-id it is about.
- Show the code excerpt or diff the question is about, with its file and line.
- Short, direct sentences; plain words over jargon; never drop a detail the user needs to answer.
