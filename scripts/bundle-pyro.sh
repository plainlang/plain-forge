#!/usr/bin/env bash
#
# Copy pyro's `render-spec` skill from the vendor/pyro submodule into
# forge/skills/render-spec so it ships in the npm package. Agents only discover
# skills directly under skills/, and the skill is a subfolder of the pyro repo,
# so the submodule alone is not enough.

set -euo pipefail

SKILL="render-spec"

die() { printf '\033[0;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."
SRC="vendor/pyro/skills/$SKILL"
DEST="forge/skills/$SKILL"

[ -f "$SRC/SKILL.md" ] \
  || die "$SRC/SKILL.md not found — run: git submodule update --init vendor/pyro"

# The skill stamps its own version into SKILL.md's `metadata: version:`.
VERSION=$(sed -n 's/^[[:space:]]\{1,\}version:[[:space:]]*["'\'']\{0,1\}\([^"'\'' ]*\).*/\1/p' "$SRC/SKILL.md" | head -n 1)
[ -n "$VERSION" ] || die "could not read the version from $SRC/SKILL.md"

rm -rf "$DEST"
cp -R "$SRC" "$DEST"
find "$DEST" -name '__pycache__' -type d -prune -exec rm -rf {} +

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "version=$VERSION" >> "$GITHUB_OUTPUT"
fi

echo "bundled pyro $VERSION ($(git -C vendor/pyro rev-parse --short HEAD)) into $DEST"
