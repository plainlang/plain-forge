# Forge Plain Workflow Checklist

This is the **review agent's** script, and the review agent is **one-shot**: it gets everything in its spawn prompt, runs to completion, and returns a single result. It cannot ask the orchestrator or the user anything mid-run — no supported runtime (Claude Code, Codex, OpenCode) lets a subagent converse back. So at each phase gate the orchestrator supplies, in the spawn prompt: this block for the phase being closed, the loop-iteration block (Phases 1–3 only), the paths of the files touched this phase, and a **phase evidence record** — the ordered account of what happened in the interview (each question, its answer, the snippet written or edited, the approval given, and every explicit decision). Load the `***plain` rules with `load-plain-reference` before judging, so boxes like ≤200 LOC, define-before-use, and language-agnostic can be assessed.

Verify each box by its tag:

- **[disk]** — check independently against the files on disk; ignore the record.
- **[record]** — check against the evidence record; the disk cannot show it.
- **[both]** — the record claims it and the disk must corroborate; **flag any mismatch** (e.g. the record says conformance was declined but a conformance script exists on disk, or claims a spec was approved that is not on disk).

A box is met only when its source confirms it. Return `APPROVED` only when every box in the relevant blocks passes; otherwise return a numbered list of the unmet boxes, each naming the exact file (and line where relevant) or the record item at fault. The orchestrator loops (fix → re-review with a fresh agent) until a review agent returns `APPROVED`; it never advances on an unmet box.

## Every loop iteration (Phases 1–3)

- [ ] **[record]** Asked exactly one focused question via `AskUserQuestion` each iteration — not two bundled together.
- [ ] **[both]** Wrote the snippet to disk immediately after the answer, using the dedicated edit skill — never hand-authored a `***plain` section directly.
- [ ] **[record]** Reviewed only what just changed (missing parts / extensions / ambiguities), applied the response back to disk, and got explicit approval before moving on.
- [ ] **[both]** Any answer that contradicted an earlier snippet was fixed in place before the next question — no stale spec left on disk.
- [ ] **[both]** Stayed within the current phase — no drafting of later-phase content on disk, no multi-question detours into later-phase topics.

## Phase 0 — Intent

- [ ] **[record]** Invoked `load-plain-reference` first (unless already loaded this session).
- [ ] **[record]** Read `references/phase-0-intent.md` and asked its five core questions one at a time.
- [ ] **[record]** Asked no more than one focused follow-up for an answer too vague to summarize.
- [ ] **[record]** Kept features, entities, technology, architecture, and testing for later phases.
- [ ] **[disk]** Wrote no project or specification files during Phase 0.
- [ ] **[record]** Summarized the problem, primary user, desired outcome, observable success
  criterion, and initial boundary with explicit exclusions; got explicit confirmation.

## Phase 1 — What are we building?

- [ ] **[record]** Carried the confirmed Phase 0 intent brief into
  `references/phase-1-product.md`; refined it without restarting intent discovery.
- [ ] **[record]** Walked Phase 1 topics in order (description, users/product shape, scope, entities,
  features, flows, constraints, UI if any, anything else).
- [ ] **[disk]** `.plain` module structure created with YAML frontmatter; template (if any) has no `***functional specs***`.
- [ ] **[both]** Every concept authored in `***definitions***` via `add-concept`, defined before use.
- [ ] **[both]** Every feature authored as functional specs via `add-functional-spec(s)`, each ≤200 LOC, in chronological build order.
- [ ] **[disk]** No `***test reqs***` or `***acceptance tests***` written in this phase.
- [ ] **[disk]** Every `***implementation reqs***` bullet written this phase is technology-free policy — none names a language, framework, library, storage engine, or deployment target.
- [ ] **[record]** Summarized the full feature list and module/concept layout; got explicit overall confirmation.

## Phase 2 — What tech should it use?

- [ ] **[record]** Read `references/phase-2-tech.md` and walked its topics in order (language, frameworks, storage, external services, structure/architecture, other constraints, anything else).
- [ ] **[disk]** Every requirement authored into `***implementation reqs***` at the right scope (shared → template, module-specific → module).
- [ ] **[disk]** No `***test reqs***` or `***acceptance tests***` written in this phase.
- [ ] **[record]** Summarized the tech stack and architecture; got explicit overall confirmation.

## Phase 3 — How is testing done?

- [ ] **[record]** Read `references/phase-3-testing.md`; stated the planned `config.yaml` split (one per part) and confirmed it before topic 1.
- [ ] **[disk]** Honored the hard partition — every `:UnitTests:` fact in `***implementation reqs***`, every `:ConformanceTests:` fact in `***test reqs***`; never shared a bullet.
- [ ] **[record]** Walked topics in order (unit framework, unit types/architecture, conformance decision, prepare-environment decision, layout, execution, other constraints, anything else).
- [ ] **[disk]** Generated the needed scripts under `test_scripts/` via the `implement-*-script` skills and added each `*-script:` entry to the right `config.yaml`.
- [ ] **[both]** Conformance decision was asked explicitly; if yes, walked every Phase-1 functional spec one at a time for acceptance tests via `add-acceptance-test` (acceptance tests present on disk when the decision was yes).
- [ ] **[record]** Prepare-environment decision was asked explicitly and recorded.
- [ ] **[record]** Recapped the testing strategy; got explicit overall confirmation.
- [ ] **[record]** Ran `check-plain-env`; it returned `PASS`, or `WARN`/`FAIL` with each remaining item explicitly acknowledged by the user (re-invoked after any install).

## Phase 4 — Validate and hand off

- [ ] **[disk]** Identified the render target — the last module in the dependency chain (or the single module).
- [ ] **[both]** Ran `init-config-file` to build the final `config.yaml`(s); resolved any precondition gap with the user before validating.
- [ ] **[record]** Ran `plain-healthcheck`; worked its numbered list to `PASS` — never handed off the render target on a `FAIL`.
- [ ] **[record]** Handed off the render target only after `plain-healthcheck` passed, plus every side-channel script actually generated in Phase 3.
