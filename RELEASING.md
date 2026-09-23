# Releasing plain-forge

Publishing a GitHub Release is the release. Everything else is automated.

```
you: create release v1.0.21  →  tests  →  npm publish  →  Deployments + Slack
```

## The version lives in the tag, not in package.json

The release tag is the single source of truth for the version. The workflow reads
`v1.0.21` off the tag and writes `1.0.21` into `package.json` **inside the runner**,
immediately before publishing. Nothing is committed back.

This is deliberate: writing the version to `main` would mean a bookkeeping commit on
a protected branch, which needs either a stored credential or a self-merging PR. The
tag avoids both — the same model the [codeplain](https://github.com/Codeplain-ai/codeplain)
repo uses, where hatch-vcs derives the version from the tag.

The consequence, so it doesn't surprise anyone: **`package.json` on `main` is stale by
design.** At the time of writing it says `1.0.19` while npm serves `1.0.20`. The tag and
the registry are authoritative; the file is scaffolding.

## Cutting a release

1. Make sure `main` is green and has everything you want to ship.
2. Create a GitHub Release:
   - **Choose a tag** → type `vX.Y.Z` → *Create new tag on publish*
   - **Target**: `main`
   - **Title**: `vX.Y.Z`
   - **Notes**: see [Release notes](#release-notes) below
   - Leave **Set as a pre-release** unchecked for a normal release
3. Publish it. The `publish` workflow starts on its own.

Or from the CLI:

```bash
gh release create v1.0.21 --target main --title v1.0.21 --notes-file notes.md
```

Tags are `v`-prefixed. A bare `1.0.21` would still publish — the workflow strips a
leading `v` — but every message, link and convention here assumes the prefix.

## What the workflow does

[`.github/workflows/publish.yml`](.github/workflows/publish.yml), triggered by
`release: [published]`:

| step | detail |
|---|---|
| Test | full suite against the tagged tree; a failure stops the release and posts to Slack |
| Bundle pyro | `scripts/bundle-pyro.sh` copies `render-spec` from the `vendor/pyro` submodule into `forge/skills/` and checks it is in the package. Bump the submodule first to ship a newer pyro |
| Read version | strips the `v`, refuses anything that isn't semver |
| Refuse duplicates | fails if that version is already on npm |
| Set version | `npm version --no-git-tag-version` in the runner only |
| Publish | `npm publish --access public`, or `--tag next` for a pre-release |
| Record | Deployment under the `npm` environment; Slack start / success / failure |

Auth is **OIDC trusted publishing** — there is no npm token in this repo. npm exchanges
the workflow's OIDC token for a short-lived credential and attaches a SLSA provenance
attestation automatically.

### Pre-releases

Tick **Set as a pre-release** on the release form. The package publishes under the
`next` dist-tag, so `npm install plain-forge` (which resolves `latest`) is unaffected.
Semver pre-release tags work too: `v1.1.0-rc.1`.

## Every merge into main publishes a prerelease

No action needed — it is automatic. Merging into `main` runs the `prerelease` job in
`publish.yml`, which publishes to the **`next`** dist-tag. `latest` is never touched, so
`npx plain-forge` users only ever see cut releases.

The version is derived in the runner, never committed:

```
latest on npm = 1.0.20   ->   1.0.21-next.a3f9c21
                                ^^^^^^  ^^^^^^^
                                patch   the merge
                                bump    commit sha
```

The current `latest` is the base because `package.json` on `main` is stale by design (see
above). Patch-bumping it puts every prerelease *below* the release it anticipates:
`1.0.20 < 1.0.21-next.a3f9c21 < 1.0.21`. Once `v1.0.21` ships, the next merge derives
`1.0.22-next.<sha>` on its own.

Consuming them:

```bash
npx plain-forge@next install         # newest prerelease
npx plain-forge@1.0.21-next.a3f9c21  # one exact commit
```

`--tag next` is repointed by each publish, so `@next` is always the most recently
published prerelease regardless of how shas happen to sort. Sha identifiers do **not**
order chronologically — semver compares them alphanumerically — so never rely on a semver
*range* to pick "the newest prerelease"; name `@next` or an exact version.

Two consequences worth knowing:

- **Every merge permanently adds a version to npm.** Unpublishing is only possible within
  72 hours, so the registry accumulates one prerelease per merge. Add a `paths-ignore` to
  the `push` trigger if that churn stops being worth it — only `bin/cli.mjs` and `forge/`
  reach the tarball, so docs-only and test-only merges publish nothing of substance.
- **Re-running a merge's workflow is a no-op**, not a failure. The version is derived from
  the sha, so the job detects the version is already on npm and skips.

Slack gets a line either way: the version published and how to try it, or the failure with
`latest` confirmed unaffected. A re-run that had nothing to publish says so rather than
claiming something shipped. The run summary records the same thing.

## Release notes

Generated notes (`--generate-notes`, or the button on the form) list merged PRs and are
a fine starting point, but the convention here is a written summary in three sections,
with the changelog link last:

```markdown
## New features & improvements

- **Short bold lead.** What changed and why it matters, in a sentence or two.

## Fixes

- What was broken, and what the fix actually was.

## Internal improvements

- Refactors, CI, dependencies — things that don't change behaviour for users.

**Full Changelog**: https://github.com/plainlang/plain-forge/compare/v1.0.20...v1.0.21
```

Editing a release afterwards fires `release: edited`, not `published`, so fixing typos
in the notes will **not** re-trigger a publish. That's safe to do at any time.

## Releasing without GitHub Actions

[`scripts/deploy.sh`](scripts/deploy.sh) performs the same release from a workstation —
for when Actions is down, or you want to ship without waiting on it.

```bash
npm login                            # OIDC only works from CI; locally you publish as yourself
./scripts/deploy.sh --dry-run        # test + pack the latest release, publish nothing
./scripts/deploy.sh                  # publish the latest GitHub release
./scripts/deploy.sh --tag v1.0.21    # publish a specific tag
./scripts/deploy.sh --otp 123456     # if your npm account requires 2FA on publish
```

It checks the tag out into a temporary git worktree, so your working tree, branch and
uncommitted edits have no bearing on what ships. It runs the same guards (semver,
already-published), records the same Deployment, and posts the same Slack messages.

Slack comes from `SLACK_WEBHOOK_URL` in the environment, or from a `.env.release` file
at the repo root — gitignored, and the only place a webhook should live locally.

## Prerequisites (already configured)

| what | where | note |
|---|---|---|
| Trusted publisher | npmjs.com → `plain-forge` → Settings → Trusted Publisher | GitHub Actions, `plainlang/plain-forge`, workflow `publish.yml` |
| `SLACK_WEBHOOK_URL` | repo secret | notifications are skipped without it |
| `LINEAR_ACCESS_KEY` | repo secret | records the release in Linear; the job is currently commented out in `publish.yml` |
| Branch protection | `main` | `Test (node 22 / 24)` required, no force pushes, no deletion |

**The workflow filename is part of the trust contract.** Renaming `publish.yml` breaks
publishing until the trusted publisher entry on npmjs.com is updated to match.

## Troubleshooting

**"is already published — tag a new version."** npm versions are immutable. Cut a new
version; don't try to overwrite.

**"is not a semver release tag."** The tag must be `vX.Y.Z`, optionally with a
pre-release suffix. `release-2` or `v1.0` will not do.

**The workflow ran an old version of itself.** For `release` events the workflow file is
read from the commit the tag points at, not from the tip of `main`. If you changed the
workflow after tagging, re-cut the release (below) so the tag lands on the newer commit.

**Re-running a failed run doesn't pick up fixes.** A re-run replays the same commit. To
run a *changed* workflow, delete and re-create the release so a fresh `published` event
fires:

```bash
gh release delete v1.0.21 --yes --cleanup-tag
gh release create v1.0.21 --target main --title v1.0.21 --notes-file notes.md
```

Safe as long as nothing was published from that tag — deleting a release does **not**
unpublish anything from npm, and it **does** destroy the release notes, so keep them in
a file.

**The run sits in `queued` forever.** Usually a GitHub incident rather than anything in
this repo — check [githubstatus.com](https://www.githubstatus.com). Queued jobs may
never start and can become uncancellable. Either wait for the all-clear and re-cut, or
publish with `scripts/deploy.sh`.

## After a release

- npm: `npm view plain-forge version`
- Provenance: `npm view plain-forge@<version> dist.attestations`
- Deployments: repo → **Deployments → npm**
- Users update with `npx plain-forge@latest update`
