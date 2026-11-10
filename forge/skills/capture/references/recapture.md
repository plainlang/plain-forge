# Re-capture

Runs when `plain/capture.json` holds captured units. It never absorbs a change on its own: every change to a unit's code or boundary that did not come from a current render is flagged and decided by the user. Running it twice on the same state writes nothing the second time.

In every command below, `<id>` is the unit's id from the manifest.

## 1. Read the status

Run `capture-state.mjs status`, or `status --unit <id>` when the user named a unit.

- **Exit `0`** — every unit is up to date and every copy under `plain/resources/host/` matches its host file. Report each unit's `last_captured` commit and list any `awaiting_render` files. If a unit's `outside` lists changed files, do step 5 for it before stopping: a new caller of the unit changes no unit or boundary file, so it never moves the exit code. Otherwise stop and write nothing.
- **Exit `1`** — handle each unit by its `state`:
  - `uncommitted` — list the files and ask the user to commit or discard them. Skip the unit until then: capture compares commits, never work in progress.
  - `capturing` — the first capture never finished; resume it from the SKILL.md phase whose output is missing.
  - `changed` — review it, in the order below.

## 2. Accept changes that came from a current render

A unit change with `"origin": "rendered"` matches the renderer's output, and that render is not older than the specs: the specs produced it. Accept it without asking: `snapshot --unit <id> --paths <files>`.

A change with `"origin": "stale-render"` matches a render made before the specs last changed, so it proves nothing about the current specs: handle it in step 4.

## 3. Review boundary changes

A file in `boundary_changes` is a host file the unit depends on. For each, show `git diff <since>..HEAD -- <file>` and the concept or requirement that links it, and ask one question:

- **Update the specs** — the change alters a name, signature, type, error, or behavior the unit relies on. Edit the affected `.plain` text through its skill, then `snapshot --unit <id> --paths <file>`.
- **No spec change** — the change does not affect the unit. `snapshot --unit <id> --paths <file>`.
- **Defer** — no snapshot; the next run asks again.

Unless the answer was defer, also refresh the file's copy under `plain/resources/host/`, if it has one.

## 3b. Refresh stale copies

`stale_copies` lists the copies under `plain/resources/host/` that no longer match their host file. A copy is a byte-for-byte snapshot, so refreshing it is not a spec decision:

- **`differs`** — copy the host file over it. If the file is not in any unit's boundary, say which copy was refreshed; if it is, step 3 has already decided what the change means for the specs.
- **`source-missing`** — the host file is gone, or is no longer a file. Ask whether to delete the copy and rewrite the specs that link it, or to keep it as it is for now.

## 4. Flag edits to the unit's code

A unit change with `"origin": "edited"`, `"unknown"`, or `"stale-render"` is an edit to the unit's code that did not come from its current specs. Group the changes by `func_ids` (each change with no func-id is its own group). For each group ask one question that shows the diff (`git diff <since>..HEAD -- <file>`, or the whole file when `since` is null), the current text of each func-id, and these options:

- **Adopt into the specs** — the edit becomes intended behavior. Change the functional spec through `add-functional-spec`, or edit it in place and then run `analyze-if-func-spec-too-complex` and `analyze-func-specs` on it as `add-functional-spec` does; resolve any conflict the way `add-feature` does (keep, augment, or replace), and update its test plain file with `add-test-scenarios`. Map any new file to its func-id in `functionalities`. Snapshot only after those checks pass: `snapshot --unit <id> --paths <files>`.
- **Revert to the specs** — the specs stay as they are and the next render replaces the edit. Run `snapshot --unit <id> --revert --paths <files>`; `status` lists the files under `awaiting_render` until a render replaces them (or, for a deleted file, restores it).
- **Defer** — no snapshot; the next run flags the same change again.

Add to the question, by origin:

- `"unknown"` — the render output is not on disk, so the change may be a render that already landed; offer to render first to tell the two apart.
- `"stale-render"` — the change matches a render made before the specs last changed; offer to render the current specs first.

Never adopt or revert without the user's answer, and record each answer in the unit's `answers`.

## 5. Look at the rest of the host

`outside` counts the files that changed outside every unit and boundary since `last_captured`, with a sample. Do not review them one by one. If a sampled file now calls the unit or is now called by it, ask whether to add it to the unit's `boundary` in the manifest; if added, `snapshot --unit <id> --paths <file>`.

## 6. Close

1. Run `status` again. A unit is up to date only when nothing is left to decide; its `last_captured` advances to `HEAD` at that moment, through `snapshot`.
2. If anything was deferred, list it: `last_captured` stays where it was, and the next run starts from the same items.
3. If any `.plain` file changed, run `plain-healthcheck` until `PASS`, then ask whether to render the unit now.
4. Remind the user to commit `plain/`, including `capture.json`.

## When `last_captured` is gone

If `last_captured_reachable` is `false` (history was rewritten), `status` still classifies every change by hash, but `since` commits may not exist. Show the current file and the spec text instead of a diff, and say why.
