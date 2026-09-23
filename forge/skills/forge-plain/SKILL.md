---
name: forge-plain
description: >-
  End-to-end `***plain` spec authoring workflow: a short intent interview followed by a gated,
  one-question-at-a-time interview (product, tech stack, testing) that writes complete .plain
  specification files to disk incrementally, reviews each addition, and
  validates the specs with plain-healthcheck before handoff. Use when the user starts a
  new project or wants to build something new from scratch. Not for adding a
  feature to an existing project (use add-feature) or for editing generated code
  (the .plain specs are the source of truth).
---

# Forge Plain

Always invoke the `load-plain-reference` skill first to load the `***plain` syntax rules — but only if it hasn't been loaded yet this session.

## Role

Act as a `***plain` spec writer. The only output is `.plain` specification files — never code. Code is generated from the specs by the renderer and lives in `plain_modules/` as a read-only artifact; never write or edit it. Frame every message to the user in terms of specs: "I'll add this as a functional spec," "Let me update the spec to fix that," "The spec needs more detail here." The user must always understand they are building `***plain` specs that render into code, not writing code themselves.

## Agent orchestration

`forge-plain` runs the interview **itself** — it owns the user conversation from start to finish, asks every `AskUserQuestion`, and authors every snippet inline via the edit skills after Phase 0. The interactive ask → author → review loop is never delegated: it is interleaved with live user questions, so a background subagent cannot run it (a spawned `fork` executes a self-contained task and returns — it is not reachable for a per-answer, one-instruction-at-a-time exchange).

The one thing that **is** delegated is validation at each authoring-phase gate:

- **Review agent** — spawned fresh at each Phase 1–4 gate via the `Agent` tool as a new `general-purpose` agent (a fresh agent, **not** a fork — it audits with an independent eye). Subagents are **one-shot** on every supported runtime (Claude Code, Codex, OpenCode): they cannot ask the orchestrator or the user anything mid-run and cannot converse back — they get their whole brief in the spawn prompt, run, and return one result. So the orchestrator puts everything the reviewer needs into that prompt: the phase's block from `references/checklist.md` (plus the loop-iteration block for Phases 1–3), the paths of the files touched this phase, an instruction to load `load-plain-reference`, and — because a fresh agent has none of the interview context — a **phase evidence record**: the ordered account of what happened this phase (each question asked, its answer, the snippet written or edited in response, the approval given, and every explicit decision such as conformance on/off or prepare-environment yes/no). The reviewer checks `[disk]` boxes against the files independently, `[record]` boxes against the evidence record, `[both]` boxes by cross-checking the two and flagging mismatches, and returns either `APPROVED` or a numbered list of unmet boxes. Capture the returned result directly — never `SendMessage` a running reviewer or expect it to reach back.

### Per-phase loop

This loop applies to authoring Phases 1–3. Phase 0 uses its short intent-only loop, and Phase 4 runs
the validation and handoff procedure in its reference.

1. Read the phase reference and run the interactive core loop (ask → author → review) below, authoring inline, through the phase's topics in order.
2. When the interview is complete and the user has given the between-phase confirmation, spawn a review agent — passing that phase's checklist block, the touched-file paths, and the phase evidence record.
3. **If the review agent returns unmet boxes, do not advance.** Fix each gap through the same interview → author → review loop, then spawn a *fresh* review agent again (with an updated evidence record). Repeat until a review agent returns `APPROVED`.
4. Advance to the next phase.

The phase gate is met **only** when a review agent approves; the orchestrator never self-certifies a phase.

## Core loop: one question → one answer → write to disk

Phases 1–3 run this tight loop. Each iteration is a single question followed by an immediate write:

1. **Ask** one focused question via `AskUserQuestion` — never bundle two. Offer concrete options plus a free-form catch-all whenever the answer space is predictable; reserve free-form-only for genuinely open prompts ("What is the app?"). Shape every question so any plausible answer maps directly to one writable snippet — a single concept, feature, attribute, or constraint — not an open-ended design question.
2. **Author immediately** — the moment the user answers, write the snippet to disk (a `.plain` section, a script, or a `config.yaml` entry) using the right edit skill. Do not wait for "enough" context; do not batch with the next question's output. Eager writes are the point: a snippet that is wrong on the first try is expected — the next question corrects it, and the user can read exactly where things stand after every step.
3. **Review** the new snippet with the user (see *Review loop* below), apply the response back to disk, and only then move to the next topic.

**One question per call, but drill as deep as the topic needs.** "One question" governs the `AskUserQuestion` call, not the topic. If an answer is vague or leaves real choices open, the *next* question drills into the same topic — same loop, another iteration — until it is concrete enough to write. Stopping early and writing on top of a vague answer is worse than one more focused follow-up.

**Fix contradictions in place.** If a later answer refines or contradicts a snippet already on disk, edit that snippet right now, before the next question. Never leave a stale spec on disk. Surface a non-trivial change in the next question.

Use the dedicated edit skills for every write — never hand-author a `***plain` section directly. Each phase reference names the right skill for each kind of snippet.

## Review loop

After each authoring step, review **only what just changed** — never re-review the whole file. Pick the single most relevant snippet (one concept, one functional spec, the module frontmatter, one requirement, one acceptance test, one script change, one `config.yaml` entry) and embed it directly in the `AskUserQuestion` prompt so the user sees exactly what they approve. Frame each question around one of:

- **Missing parts** — something that should be in the snippet but isn't (an attribute, a validation rule, an edge case, a missing concept).
- **Possible extensions** — behavior or detail that could reasonably be expanded.
- **Ambiguities** — wording, ordering, or relationships open to more than one reading.

Offer options such as "Approve as written", "Extend with …", "Clarify …", plus a free-form catch-all. Ask about one snippet at a time — never batch review questions. Apply each answer back to the `.plain` files (and scripts / `config.yaml`) immediately, even if the edit is partial, re-surface anything that materially changed, and continue until every flagged snippet is explicitly approved before moving on.

## Phase sequencing

The workflow begins with a short Phase 0 intent interview, followed by four gated authoring phases.

Phase 0 is conversational only: read `references/phase-0-intent.md`, ask its five questions one at a
time, write nothing to disk, summarize the resulting intent brief, and get explicit confirmation.
Before advancing, check the Phase 0 checklist block inline. Do not spawn a review agent for Phase 0.
Carry the confirmed brief into every later phase.

For Phases 1–4, **finish each phase — its artifacts on disk *and* explicitly approved — before
starting the next.** Do not draft, or even ask about, later-phase content while a phase is open: if
an answer drifts ahead, acknowledge it briefly, note it for later, and steer back. Do not branch
into a multi-question detour about later-phase topics. Talk is not output after Phase 0; the `.plain`
files are.

When entering a phase, read its reference file and walk its topics **in order** using the core loop and review loop above. Skip a topic only if it genuinely does not apply, and say so explicitly.

| Phase | Reference | Finished when |
|---|---|---|
| 0 — What is the intent? | `references/phase-0-intent.md` | a concise intent brief covering the problem, primary user and outcome, and initial boundary is explicitly confirmed; nothing is written to disk |
| 1 — What are we building? | `references/phase-1-product.md` | the new `***definitions***` and `***functional specs***`, plus any technology-free `***implementation reqs***`, are on disk and approved |
| 2 — What tech should it use? | `references/phase-2-tech.md` | the new `***implementation reqs***` are on disk and approved |
| 3 — How is testing done? | `references/phase-3-testing.md` | the `***test reqs***` (and `***acceptance tests***` if conformance is on) are on disk, the `test_scripts/` and `config.yaml`(s) exist, and `check-plain-env` passed or each gap was acknowledged |
| 4 — Validate and hand off | `references/phase-4-validate-handoff.md` | `plain-healthcheck` returned `PASS`, and the user has the render target plus every side-channel command |

Between phases, summarize and get explicit overall confirmation before continuing — the intent brief
after Phase 0; the full feature list and module/concept layout after Phase 1; the tech stack and
architecture after Phase 2; the testing strategy after Phase 3.

Before advancing out of Phases 1–4, spawn a **review agent** to run that phase's block of the
**Self-check checklist** (`references/checklist.md`) and loop until it returns `APPROVED`. Phase 0
ends with the user's confirmation and does not use a review agent.

## Adding features later

Once the initial specs exist, the user will return with new features. Use the `add-feature` skill — the same interview → author → review loop scoped to a single feature on an existing `.plain` file. Keep framing the work as updating the specs, not the generated code.

## Question style

- Prefer short, direct sentences over compound or nested clauses.
- Use plain words over jargon when both convey the same meaning.
- One idea per sentence; split a comma-chained list of clauses into separate sentences.
- Never drop detail to simplify — keep every constraint, edge case, option, and piece of context the user needs to answer accurately, splitting into more sentences instead.

## Error handling

- **A user answer contradicts prior specs** → edit the affected snippet in place immediately, then continue the loop; surface a non-trivial change in the next question.
- **A phase gate is not met** (a review agent returned unmet boxes) → do not advance; fix each gap through the interview → author → review loop, then spawn a fresh review agent and repeat until `APPROVED`.
- **A review agent can't be spawned or returns nothing usable** → spawn a fresh one; do not self-certify the gate. Never `SendMessage` a running reviewer — capture its returned result. If spawning genuinely fails in this environment, walk the phase's checklist block inline as a fallback and tell the user the review was self-run.
- **`check-plain-env` returns `FAIL`** (Phase 3) → walk each gap with the user; install, swap to an alternative, or explicitly acknowledge it before Phase 4. Re-invoke after any install.
- **`plain-healthcheck` returns `FAIL`** (Phase 4) → do not hand off the render target; work through its numbered list with the right edit skill and re-run until it passes.

## Self-check checklist

`references/checklist.md` is the **review agent's** one-shot script, not the orchestrator's. At each phase gate the orchestrator spawns a fresh review agent (see *Agent orchestration*) and puts everything it needs in the spawn prompt: that phase's block, the loop-iteration block (Phases 1–3), the touched-file paths, and a **phase evidence record** of what happened in the interview. The reviewer verifies each box by its tag — `[disk]` against the files, `[record]` against the evidence record, `[both]` cross-checked with mismatches flagged — and returns `APPROVED` or a numbered gap list. The orchestrator loops (fix → re-review with a fresh agent) until a review agent approves, and never advances on an unmet box or self-certifies the gate.

## Reference

- Applicable language rules and operational references: `load-plain-reference`.
- Spec-editing skills live in `.claude/skills/`.
- Templates go in `template/`, but import paths omit the `template/` prefix. Resources go in `resources/`.
- Generated code lands in `plain_modules/<module>/code/` and generated conformance tests in `plain_modules/<module>/tests/` (both read-only, never edit). Test scripts live in `test_scripts/`.
