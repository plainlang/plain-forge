#!/usr/bin/env bash
#
# Publish plain-forge to npm from a workstation — the same release the
# `publish` GitHub Action performs, minus the Action.
#
#   ./scripts/deploy.sh                 # publish the latest GitHub release
#   ./scripts/deploy.sh --tag v1.0.21   # publish a specific tag
#   ./scripts/deploy.sh --dry-run       # rehearse: test + pack, publish nothing
#   ./scripts/deploy.sh --otp 123456    # npm account with 2FA on publish
#
# The tag is the source of truth for the version. The release is built from a
# clean checkout of that tag in a temporary worktree, so whatever is in your
# working tree right now is irrelevant and untouched.
#
# Auth differs from CI: Actions uses OIDC trusted publishing, which only works
# from a CI runner. Locally you publish as yourself — `npm login` first.
#
# Slack notices post as the same bot, to the same channel, as the publish
# workflow: set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID in the environment or in a
# gitignored .env.release file. Without them the release ships unannounced.

set -euo pipefail

PKG="plain-forge"
ENVIRONMENT="npm"
REPO="plainlang/plain-forge"

TAG=""
DRY_RUN=false
OTP=""
ASSUME_YES=false
WORKTREE=""
DEPLOYMENT_ID=""
VERSION=""
SLACK=false
SLACK_TS=""
PUBLISHING=false

# ---------------------------------------------------------------- utilities

log()  { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# Calls a Slack Web API method and prints its response. A failure only warns:
# Slack must never block a release. The token goes in through stdin, not argv.
slack_api() {
  local response error
  response=$(printf 'Authorization: Bearer %s\n' "$SLACK_BOT_TOKEN" |
    curl -sS --max-time 10 -H @- -H 'Content-Type: application/json; charset=utf-8' \
      --data "$2" "https://slack.com/api/$1") || true
  if [ "$(jq -r .ok <<<"$response" 2>/dev/null)" != true ]; then
    error=$(jq -r '.error // empty' <<<"$response" 2>/dev/null) || true
    warn "slack $1 failed${error:+: $error}"
    return 1
  fi
  printf '%s\n' "$response"
}

# Posts a notice and prints its ts. Given a ts, it replies in that thread, and
# "broadcast" also shows the reply in the channel.
slack() {
  [ "$SLACK" = true ] || return 0
  { slack_api chat.postMessage "$(jq -n --arg channel "$SLACK_CHANNEL_ID" --arg text "$1" \
      --arg thread_ts "${2:-}" --arg broadcast "${3:-}" '{channel: $channel, text: $text}
      + if $thread_ts == "" then {} else {thread_ts: $thread_ts, reply_broadcast: ($broadcast == "broadcast")} end')" \
    || true; } | jq -r '.ts // empty'
}

# Puts a ✅ on the start notice, as the publish workflow does on success.
slack_react() {
  [ "$SLACK" = true ] && [ -n "$1" ] || return 0
  slack_api reactions.add "$(jq -n --arg channel "$SLACK_CHANNEL_ID" --arg timestamp "$1" \
    '{channel: $channel, timestamp: $timestamp, name: "white_check_mark"}')" >/dev/null || true
}

cleanup() {
  local code=$?
  # Only a publish that was announced reports its failure, in the start notice's
  # thread and the channel. This runs before the worktree, our cwd, is removed.
  if [ "$code" -ne 0 ] && [ "$PUBLISHING" = true ]; then
    deployment_status failure
    slack "*${PKG}*: publishing \`v${VERSION}\` to npm FAILED :x: (local deploy by *$(whoami)*)." "$SLACK_TS" broadcast >/dev/null
  fi
  if [ -n "$WORKTREE" ] && [ -d "$WORKTREE" ]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  exit "$code"
}
trap cleanup EXIT

# GitHub Deployments — the same record the workflow's `environment:` produces,
# so local releases show up in the repo's Deployments list too.
deployment_create() {
  # required_contexts must be a real JSON array, so the body is built with jq
  # rather than gh's -f/-F flags.
  DEPLOYMENT_ID=$(jq -n \
      --arg ref "$TAG" --arg env "$ENVIRONMENT" --arg desc "local deploy of $TAG by $(whoami)" \
      '{ref: $ref, environment: $env, description: $desc,
        auto_merge: false, required_contexts: [], production_environment: true}' \
    | gh api "repos/$REPO/deployments" --input - --jq .id 2>/dev/null) \
    || { warn "could not create deployment record"; DEPLOYMENT_ID=""; }
}

deployment_status() {
  [ -n "$DEPLOYMENT_ID" ] || return 0
  gh api "repos/$REPO/deployments/$DEPLOYMENT_ID/statuses" \
    -f state="$1" \
    -f environment_url="https://www.npmjs.com/package/$PKG/v/$VERSION" \
    -f description="${2:-}" >/dev/null 2>&1 || warn "could not update deployment status"
}

# ---------------------------------------------------------------- arguments

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)     TAG="${2:-}"; shift 2 ;;
    --otp)     OTP="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -y|--yes)  ASSUME_YES=true; shift ;;
    -h|--help) usage 0 ;;
    *)         die "unknown argument: $1 (try --help)" ;;
  esac
done

# ---------------------------------------------------------------- preflight

cd "$(dirname "$0")/.."

for bin in git gh npm node jq curl; do
  command -v "$bin" >/dev/null || die "$bin is required but not installed"
done

gh auth status >/dev/null 2>&1 || die "gh is not authenticated — run: gh auth login"

if [ -f .env.release ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env.release
  set +a
fi

SLACK=true
for var in SLACK_BOT_TOKEN SLACK_CHANNEL_ID; do
  if [ -z "${!var:-}" ]; then
    warn "$var is not set, so this release is not announced in Slack"
    SLACK=false
  fi
done

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || die "node >= 18 required (found $(node --version))"

if [ "$DRY_RUN" = false ]; then
  npm whoami >/dev/null 2>&1 || die "not logged in to npm — run: npm login"
fi

log "fetching tags"
git fetch --tags --quiet

if [ -z "$TAG" ]; then
  TAG=$(gh release view --repo "$REPO" --json tagName --jq .tagName 2>/dev/null) \
    || die "no GitHub release found — create one, or pass --tag"
  log "latest release: $TAG"
fi

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null \
  || die "tag $TAG does not exist locally (git fetch --tags)"

VERSION="${TAG#v}"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' \
  || die "tag '$TAG' is not a semver release tag (expected vX.Y.Z)"

if npm view "$PKG@$VERSION" version >/dev/null 2>&1; then
  die "$PKG@$VERSION is already published — tag a new version"
fi

PRERELEASE=$(gh release view "$TAG" --repo "$REPO" --json isPrerelease --jq .isPrerelease 2>/dev/null || echo false)
NPM_TAG_ARGS=()
if [ "$PRERELEASE" = "true" ]; then NPM_TAG_ARGS=(--tag next); fi

echo
log "package     $PKG"
log "tag         $TAG  →  version $VERSION"
log "dist-tag    $([ "$PRERELEASE" = "true" ] && echo 'next (pre-release)' || echo latest)"
if [ "$DRY_RUN" = true ]; then
  log "publishing  (dry run — nothing is published)"
else
  log "publishing  as $(npm whoami)"
fi
log "slack       $([ "$SLACK" = true ] && echo "channel $SLACK_CHANNEL_ID" || echo 'not configured — not announced')"
echo

if [ "$ASSUME_YES" = false ] && [ "$DRY_RUN" = false ]; then
  read -r -p "publish $PKG@$VERSION to npm? [y/N] " reply
  case "$reply" in [yY]*) ;; *) die "aborted" ;; esac
fi

# ------------------------------------------------- build from a clean checkout

WORKTREE=$(mktemp -d "${TMPDIR:-/tmp}/plain-forge-release.XXXXXX")
log "checking out $TAG into $WORKTREE"
git worktree add --detach --quiet "$WORKTREE" "$TAG"
cd "$WORKTREE"
git submodule update --init --quiet vendor/pyro

log "installing dependencies"
npm ci --silent

log "running tests"
npm test

log "bundling pyro's render-spec skill"
./scripts/bundle-pyro.sh

log "setting package version to $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null

if [ "$DRY_RUN" = true ]; then
  log "dry run — packing instead of publishing"
  npm pack --dry-run
  echo
  log "dry run complete: $PKG@$VERSION would be published to '$([ "$PRERELEASE" = "true" ] && echo next || echo latest)'"
  exit 0
fi

# ------------------------------------------------------------------ publish

deployment_create
deployment_status in_progress "publishing to npm"
PUBLISHING=true
SLACK_TS=$(slack "*${PKG}*: release \`v${VERSION}\` published by *$(whoami)* — shipping to npm (local deploy)...")

log "publishing to npm"
OTP_ARGS=()
if [ -n "$OTP" ]; then OTP_ARGS=(--otp "$OTP"); fi
npm publish --access public "${NPM_TAG_ARGS[@]}" "${OTP_ARGS[@]}"
PUBLISHING=false

deployment_status success "published $PKG@$VERSION"
slack "*${PKG}*: \`v${VERSION}\` published to npm :white_check_mark:. Install with \`npx ${PKG}@latest update\`." "$SLACK_TS" >/dev/null
slack_react "$SLACK_TS"

echo
log "published $PKG@$VERSION → https://www.npmjs.com/package/$PKG/v/$VERSION"
