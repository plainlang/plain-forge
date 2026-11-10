# The capture manifest — `plain/capture.json`

The manifest is the memory of every capture: the cached scan, each captured unit, and the hash and commit of every file a unit owns or depends on. It is committed with the rest of `plain/`.

Paths use forward slashes and are relative to the host root, except `render_map[].from`, which is relative to `plain/`. A path ending in `/` or naming a folder covers everything under it; any other path names one file. `plain/` itself is never part of a unit or a boundary.

## Who writes what

| Field | Written by |
|---|---|
| `version`, `host_root`, `scan` | `capture`, by hand, in Phase 1 |
| `answers`, `units[].answers`, `units[].intent` | `capture`, by hand, the moment the user answers |
| `units[].id`, `module`, `paths`, `exclude`, `boundary` | `capture`, by hand, in Phase 2 (and when a re-capture widens the boundary) |
| `units[].render_map`, `functionalities` | `capture`, by hand, at the end of Phase 3 (and when a re-capture adopts a change) |
| `units[].status`, `last_captured`, `files`, `decisions` | `capture-state.mjs snapshot` only |

`snapshot` rewrites the file in a fixed key order, so writing the same state twice gives the same bytes.

## Shape

```json
{
  "version": 1,
  "host_root": "..",
  "answers": [
    { "topic": "adopt", "question": "Existing modules fail plain-parser (bamboo_hr.plain); proceed?", "answer": "proceed", "commit": "<commit>" }
  ],
  "scan": {
    "commit": "<HEAD when scanned>",
    "intent": "make an integration driver regenerable",
    "candidates": [
      {
        "id": "app-integrations-bamboo-hr",
        "level": "integration",
        "parent": "app-integrations",
        "paths": ["app/integrations/bamboo_hr/"],
        "exclude": [],
        "interface": ["app/integrations/bamboo_hr/driver.rb:12 BambooHr::Driver#sync"],
        "boundary": ["app/integrations/base_driver.rb", "app/models/employee.rb"],
        "leaks": [],
        "tests": { "files": ["spec/integrations/bamboo_hr/"], "command": "bundle exec rspec spec/integrations/bamboo_hr" },
        "state": "stateless",
        "third_parties": ["BambooHR API"],
        "size": { "files": 6, "lines": 540 },
        "fit": { "rating": "high", "reason": "one interface, tested, stateless" }
      }
    ]
  },
  "units": [
    {
      "id": "app-integrations-bamboo-hr",
      "module": "bamboo_hr",
      "status": "captured",
      "intent": "make an integration driver regenerable",
      "answers": [
        { "topic": "unit", "question": "Which unit?", "answer": "app-integrations-bamboo-hr", "commit": "<commit>" },
        { "topic": "leak:registry", "question": "Keep the class name the marketplace registry names?", "answer": "keep the class name", "commit": "<commit>" }
      ],
      "paths": ["app/integrations/bamboo_hr/"],
      "exclude": [],
      "boundary": ["app/integrations/base_driver.rb", "app/models/employee.rb"],
      "render_map": [
        { "from": "plain_modules/bamboo_hr/code/app/integrations/bamboo_hr/", "to": "app/integrations/bamboo_hr/" }
      ],
      "functionalities": {
        "sync-employees": ["app/integrations/bamboo_hr/driver.rb", "app/integrations/bamboo_hr/client.rb"]
      },
      "last_captured": "<commit>",
      "files": {
        "app/integrations/bamboo_hr/driver.rb": { "hash": "<sha256>", "commit": "<commit>" }
      },
      "decisions": {}
    }
  ]
}
```

## Fields

| Field | Meaning |
|---|---|
| `answers` | Answers that concern the project rather than one unit, such as proceeding past pre-existing failures in Step 0. |
| `units[].intent` | The Phase 0 intent the unit was chosen for. |
| `units[].answers` | Every answer the user gave about the unit, in the order given. Each has a `topic`, the `question` as asked (one line), the `answer` (the option chosen, plus any note), and the `commit` it was given at. |
| `scan.commit` | The `HEAD` the candidates describe. A scan of the same commit is reused, never repeated. |
| `scan.intent` | The intent the candidates are ranked for. A different intent reranks the same evidence. |
| `scan.candidates[]` | The ranked candidates from Phase 1, recommended first. Free-form beyond the fields shown. |
| `units[].id` | Kebab-case id, equal to the id of the candidate it came from. |
| `units[].module` | The root `.plain` module of the unit, without `.plain`. |
| `units[].status` | `capturing` until the first settled `snapshot`, then `captured`. |
| `units[].paths`, `exclude` | The files the unit owns. |
| `units[].boundary` | Host files outside the unit that its specs depend on. |
| `units[].render_map[]` | Where the renderer's output for the unit lands in the host. `status` compares a changed host file with its rendered counterpart to tell a render from a hand edit. |
| `units[].functionalities` | Each func-id of the unit and the source files it describes. `status` names the func-ids a changed file touches. |
| `units[].last_captured` | The commit at which every file of the unit and its boundary last matched the record. Advances only when nothing is left to decide. |
| `units[].files` | For each file of the unit and its boundary: its SHA-256 and the commit at which it was recorded. That commit is the base of the diff shown for a later change. |
| `units[].decisions` | Files whose hand edit the user chose to revert, with the hash of the edit. They stay listed as awaiting a render until the file changes again. |

## Answer topics

One topic per question, so a resumed capture can tell what is already settled: `adopt` (Step 0), `unit`, `state`, `leak:<kind>` (`boot`, `registry`, `test pin`, `call`), `unit-tests`, `testing`, `review:<step>` (a Phase 3 review), `behavior:<func-id or file:line>` (behavior that looked unintended, or code left out), `resource:<file>` (a divergence in an adopted resource), and `<topic>` for anything else. A later answer to the same topic replaces the earlier one: remove the earlier entry when you add it.
