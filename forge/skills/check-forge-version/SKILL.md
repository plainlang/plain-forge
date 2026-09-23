---
name: check-forge-version
description: >-
  Reports whether the plain-forge installation on this machine is current. Enumerates every agent
  directory plain-forge can install into — project scope and global scope, across all supported
  agent layouts — reads the installed version from each `.plain-forge/manifest.json`, resolves the
  latest published version from the npm registry, and emits a PASS / WARN / FAIL verdict naming
  every install that is current, stale, or unmanaged. For a stale install it surfaces the exact
  `npx plain-forge update` command and asks the user to run it. This concerns the plain-forge
  tooling itself, so it is not tied to any ***plain project or authoring workflow. Use when someone
  asks whether plain-forge is up to date, on the first use of a forge skill in a session, after a
  forge skill or rule behaves unexpectedly, or when a rule referenced in conversation appears to be
  missing. Do not use to perform the update, which stays the user's decision. Do not use to check a
  project's host tooling, which is what `check-plain-env` covers.
---

# Check Forge Version

This skill answers one question: **is the plain-forge installed on this machine the latest published
version?** It reads the installed version from every install's manifest, compares each against the
`latest` dist-tag on npm, and — when an install is behind — asks the user to run
`npx plain-forge update`.

The subject is **plain-forge itself**, not any project it is used on. This skill reads no `.plain`
files, needs no ***plain project in the working directory, and is equally valid in an empty
directory. Do not invoke `load-plain-reference` for it; no authoring rules apply.

## When to run

- **On the first use of any forge skill in a session** — the cheapest moment to discover that the
  skills and rules about to be followed are from a superseded release.
- **On demand** — whenever the user asks whether plain-forge is up to date, which version is
  installed, or where it is installed.
- **After a forge skill or rule behaves unexpectedly** — a skill that contradicts the documented
  behavior, or a rule file that is missing entirely, is most often a stale install rather than a bug.
- **When a skill or rule named in conversation does not exist on disk** — a newer release probably
  added it.
- **After a plain-forge release is announced**, to confirm the update actually landed in every scope.

## What this skill does NOT do

- It does **not** run `npx plain-forge update`, or install, or uninstall anything. It reports and
  asks; acting is the user's decision.
- It does **not** modify any file — not a manifest, not a skill, not a rule. It is read-only apart
  from the network read against the npm registry.
- It does **not** check project host tooling, runtimes, services, or credentials. That is
  `check-plain-env`.
- It does **not** validate `.plain` specs. That is `plain-healthcheck`.
- It does **not** resolve which agent the user *should* install into. It reports what is present.

## Workflow

### Step 1 — Run the check

Run the bundled script with the `terminal` tool, passing its path relative to this `SKILL.md`:

```
node scripts/check-forge-version.mjs
```

**Run it from the project root** whose project-scope install should be checked, giving the full path
to the script — for a Claude layout, `node .claude/skills/check-forge-version/scripts/check-forge-version.mjs`.
The script always reports the install it lives in and the global installs regardless of where it is
invoked, but it can only find a *project-scope* install in the current working directory. When the
report is missing an install that is known to exist, re-run it from that project's root before
concluding anything.

Add `--json` for a machine-readable report, or `--offline` to list the installs without querying npm.

The script is the single source of truth for this check. It mirrors `bin/cli.mjs` for both the
install-path model (including the two global paths that break the usual pattern — ForgeCode's
`~/forge` and OpenCode's `~/.config/opencode`) and the version comparison. Do not re-derive either by
hand, and do not substitute an ad-hoc `npm view` plus a guess at where the install lives.

### Step 2 — Read the verdict

The verdict is the **first line of stdout**, and it is also the exit code:

| Exit | Verdict | Meaning |
|---|---|---|
| 0 | `PASS` | Every install found is at the latest version. |
| 1 | `FAIL` | At least one install is behind the latest version. |
| 2 | `WARN` | Installs found, but at least one version is indeterminate (no manifest, or a prerelease). |
| 3 | `ERROR` | The latest version could not be resolved from npm. |
| 4 | `NONE` | No install found in any candidate directory. |

Per-install statuses are `CURRENT`, `STALE`, `UNMANAGED` (a pre-manifest install — `update` adopts
it and writes a manifest going forward), or `INDETERMINATE`.

Each install is labelled with its scope: `self` is the install this skill is running from, `project`
is one found in the current working directory, and `global` is one under the home directory.

### Step 3 — Report and prompt

Relay the verdict to the user, then act on it:

- **`PASS`** — state the installed version and that it is current. Stop. Do not suggest an update.
- **`FAIL`** or **`WARN`** — do not report this as a passing aside. Lead with the recommendation,
  name each affected install by agent, scope, and path, give the installed version and the latest
  version, and **ask the user directly to update before continuing**:

  ```
  npx plain-forge update
  ```

  State plainly that **continuing on an outdated plain-forge is not recommended** — its skills and
  rules have been superseded, specs authored against them may not match what the current
  renderer expects, and fixes released since the installed version are not in effect. On `WARN`,
  where the version could not be confirmed, say the install should be treated as outdated until
  proven otherwise.

  Add that a single `update` run covers every install across both scopes, prunes files that no longer
  ship, and never touches the user's own or third-party skills — so the fix is one command and
  carries no risk to their content.

  Then **stop and wait for the user** — do not run the update. If the user chooses to continue
  without updating, proceed with the task, but say once that the stale rules are a likely source of
  any surprising behaviour that follows.
- **`NONE`** — report that plain-forge is not installed here and surface `npx plain-forge install`,
  noting that the script's output lists every directory that was checked.
- **`ERROR`** — report that the installed versions could not be compared against anything, give the
  reason from the script, and offer the two options: re-run when the network is reachable, or check
  https://www.npmjs.com/package/plain-forge directly. Never guess whether the install is current.

When the user agrees to update, they run the command themselves. After it completes, re-run Step 1 to
confirm the result rather than assuming it worked.

## Error Handling

- **Registry unreachable** — the script already falls back from the registry endpoint to
  `npm view plain-forge version`, which succeeds on hosts pointed at an internal mirror. If both
  fail it exits 3; treat the version as unknown and surface the reason instead of assuming staleness.
- **`node` unavailable** — plain-forge requires Node ≥ 18, so this is itself the finding. Report that
  Node is missing and that no plain-forge command, including `update`, can run without it.
- **Malformed or hand-edited manifest** — the script treats an unparseable manifest as absent and
  falls back to detecting the install by its skill footprint, reporting it as `UNMANAGED`. Recommend
  `npx plain-forge update`, which rewrites a correct manifest.
- **An install ahead of the registry** — a local development build reports `CURRENT`, not stale. Do
  not prompt for an update in that case.
- **Prerelease installed** — a version such as `1.0.21-rc.1` is not dotted-numeric and reports
  `INDETERMINATE`. Prereleases ship under npm's `next` tag, so a comparison against `latest` is not
  meaningful; say so rather than prompting for an update that would move the user off the prerelease.

## Validation Checklist

- [ ] `scripts/check-forge-version.mjs` was actually executed; no verdict was inferred from memory or
      from a bare `npm view`.
- [ ] The verdict reported to the user matches the script's first line and exit code.
- [ ] Every install the script listed was relayed with its agent, scope, and path.
- [ ] `npx plain-forge update` was **offered**, never executed by this skill.
- [ ] Nothing on disk was modified.
- [ ] No `.plain` file was read and `load-plain-reference` was not invoked — this skill is about the
      tooling, not about any project.
- [ ] On `ERROR` or `NONE`, no claim was made about whether the install is current.
