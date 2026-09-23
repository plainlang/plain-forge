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
# Slack notifications are sent when a webhook is available, from either:
#   * the SLACK_WEBHOOK_URL environment variable, or
#   * a local .env.release file containing SLACK_WEBHOOK_URL=...  (gitignored)

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

# ---------------------------------------------------------------- utilities

log()  { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

slack() {
  [ -n "${SLACK_WEBHOOK_URL:-}" ] || return 0
  curl -sf -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data "$(jq -n --arg t "$1" '{text: $t}')" >/dev/null || warn "slack notification failed"
}

cleanup() {
  local code=$?
  if [ -n "$WORKTREE" ] && [ -d "$WORKTREE" ]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  if [ "$code" -ne 0 ] && [ -n "$VERSION" ] && [ "$DRY_RUN" = false ]; then
    deployment_status failure
    slack "*${PKG}*: publishing \`v${VERSION}\` to npm FAILED :x: (local deploy by *$(whoami)*)."
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
log "slack       $([ -n "${SLACK_WEBHOOK_URL:-}" ] && echo configured || echo 'not configured — notifications skipped')"
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
slack "*${PKG}*: release \`v${VERSION}\` published by *$(whoami)* — shipping to npm (local deploy)..."

log "publishing to npm"
OTP_ARGS=()
if [ -n "$OTP" ]; then OTP_ARGS=(--otp "$OTP"); fi
npm publish --access public "${NPM_TAG_ARGS[@]}" "${OTP_ARGS[@]}"

deployment_status success "published $PKG@$VERSION"
slack "*${PKG}*: \`v${VERSION}\` published to npm :white_check_mark:. Install with \`npx ${PKG}@latest update\`."

echo
log "published $PKG@$VERSION → https://www.npmjs.com/package/$PKG/v/$VERSION"
