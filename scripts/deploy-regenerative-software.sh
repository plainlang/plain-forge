#!/usr/bin/env bash
#
# Publish @plainlang/regenerative-software to npm from a workstation.
#
#   ./scripts/deploy-regenerative-software.sh                    # version from package.json
#   ./scripts/deploy-regenerative-software.sh --version 1.0.1    # a specific version
#   ./scripts/deploy-regenerative-software.sh --dry-run          # test + smoke test, publish nothing
#   ./scripts/deploy-regenerative-software.sh --otp 123456       # npm account with 2FA on publish
#
# Publishes packages/regenerative-software exactly as it is in your working tree,
# which is what the very first release needs: npm only allows a trusted publisher
# on a package that already exists, so 1.0.0 has to go out by hand. After that,
# prefer the `regenerative-software-vX.Y.Z` GitHub Release (see RELEASING.md).
#
# The package is copied to a temp dir, tested, packed, and the tarball is
# installed into a clean project and run before that same tarball is published.
# Nothing in the repo is modified. Version suffixes (1.1.0-rc.1) go to `next`.
#
# Slack notifications are sent when SLACK_WEBHOOK_URL is set, in the environment
# or in a local .env.release file (gitignored).

set -euo pipefail

PKG="@plainlang/regenerative-software"
PKG_DIR="packages/regenerative-software"

VERSION=""
DRY_RUN=false
OTP=""
ASSUME_YES=false
WORKDIR=""
PUBLISHING=false

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
  if [ -n "$WORKDIR" ] && [ -d "$WORKDIR" ]; then
    rm -rf "$WORKDIR"
  fi
  if [ "$code" -ne 0 ] && [ "$PUBLISHING" = true ]; then
    slack "*${PKG}*: publishing \`v${VERSION}\` to npm FAILED :x: (local deploy by *$(whoami)*)."
  fi
  exit "$code"
}
trap cleanup EXIT

# ---------------------------------------------------------------- arguments

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --otp)     OTP="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -y|--yes)  ASSUME_YES=true; shift ;;
    -h|--help) usage 0 ;;
    *)         die "unknown argument: $1 (try --help)" ;;
  esac
done

# ---------------------------------------------------------------- preflight

cd "$(dirname "$0")/.."

for bin in git npm node jq; do
  command -v "$bin" >/dev/null || die "$bin is required but not installed"
done

if [ -f .env.release ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env.release
  set +a
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || die "node >= 22 required (found $(node --version))"

if [ "$DRY_RUN" = false ]; then
  npm whoami >/dev/null 2>&1 || die "not logged in to npm — run: npm login"
  # npm only reports a missing scope at the final PUT, so check it up front.
  npm org ls plainlang >/dev/null 2>&1 \
    || die "the @plainlang npm org does not exist or $(npm whoami) is not a member — create it at https://www.npmjs.com/org/create"
fi

[ -n "$VERSION" ] || VERSION=$(jq -r .version "$PKG_DIR/package.json")
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' \
  || die "version '$VERSION' is not semver (expected X.Y.Z)"

if npm view "$PKG@$VERSION" version >/dev/null 2>&1; then
  die "$PKG@$VERSION is already published — pass a new --version"
fi

FORGE=$(jq -r '.dependencies["plain-forge"]' "$PKG_DIR/package.json")
npm view "plain-forge@$FORGE" version >/dev/null 2>&1 \
  || die "$PKG_DIR/package.json pins plain-forge@$FORGE, which is not on npm"

NPM_TAG_ARGS=()
case "$VERSION" in *-*) NPM_TAG_ARGS=(--tag next) ;; esac

if [ -n "$(git status --porcelain -- "$PKG_DIR")" ]; then
  warn "$PKG_DIR has uncommitted changes — they will be published as they are"
fi

echo
log "package     $PKG@$VERSION"
log "runs        plain-forge@$FORGE"
log "source      $PKG_DIR @ $(git rev-parse --short HEAD) ($(git branch --show-current))"
log "dist-tag    $([ ${#NPM_TAG_ARGS[@]} -gt 0 ] && echo 'next (pre-release)' || echo latest)"
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

# ------------------------------------------------------- build and smoke test

log "running wrapper tests"
node --test test/regenerative-software.test.mjs

WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/regenerative-software-release.XXXXXX")
mkdir "$WORKDIR/pkg" "$WORKDIR/smoke project"
cp "$PKG_DIR/package.json" "$PKG_DIR/package-lock.json" "$PKG_DIR/cli.cjs" "$PKG_DIR/README.md" "$WORKDIR/pkg/"

cd "$WORKDIR/pkg"
log "installing dependencies"
npm ci --silent --no-audit --no-fund

log "setting package version to $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null

log "packing"
TARBALL="$WORKDIR/$(npm pack --pack-destination "$WORKDIR" --silent | tail -1)"
tar -tzf "$TARBALL" | sed 's/^/      /'

# Install the packed tarball into a clean project (in a path with a space) and
# run the real installer through it — the same check CI makes.
log "smoke-testing the packed package"
cd "$WORKDIR/smoke project"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "$TARBALL"
npx --no "$PKG" install --agent claude --scope project --skip-plain-parser >/dev/null
[ -f .claude/skills/forge-plain/SKILL.md ] || die "smoke test: skills were not installed"
[ -f .claude/.plain-forge/manifest.json ] || die "smoke test: no install manifest written"
npx --no "$PKG" uninstall --agent claude --scope project >/dev/null
[ ! -e .claude/.plain-forge/manifest.json ] || die "smoke test: uninstall left the manifest behind"
log "smoke test passed"

if [ "$DRY_RUN" = true ]; then
  echo
  log "dry run complete: $PKG@$VERSION would be published to '$([ ${#NPM_TAG_ARGS[@]} -gt 0 ] && echo next || echo latest)'"
  exit 0
fi

# ------------------------------------------------------------------ publish

PUBLISHING=true
slack "*${PKG}*: \`v${VERSION}\` shipping to npm (local deploy by *$(whoami)*)..."

log "publishing to npm"
OTP_ARGS=()
if [ -n "$OTP" ]; then OTP_ARGS=(--otp "$OTP"); fi
# Publish the exact tarball that passed the smoke test.
npm publish "$TARBALL" --access public ${NPM_TAG_ARGS[@]+"${NPM_TAG_ARGS[@]}"} ${OTP_ARGS[@]+"${OTP_ARGS[@]}"}
PUBLISHING=false

slack "*${PKG}*: \`v${VERSION}\` published to npm :white_check_mark: (runs plain-forge \`${FORGE}\`). Try it with \`npx ${PKG}@latest install\`."

echo
log "published $PKG@$VERSION → https://www.npmjs.com/package/$PKG/v/$VERSION"
log "users run:  npx $PKG install"
