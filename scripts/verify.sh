#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# Required package files.
for path in \
  package.json \
  README.md \
  extensions/gitlab-duo-provider/index.ts \
  extensions/gitlab-duo-provider/account.sh \
  extensions/gitlab-duo-provider/install.sh \
  bin/pi-gitlab-duo-account \
  bin/pi-gitlab-duo-install; do
  [[ -e "$path" ]] || fail "missing $path"
done

# Shell syntax checks.
bash -n extensions/gitlab-duo-provider/account.sh
bash -n extensions/gitlab-duo-provider/install.sh
bash -n bin/pi-gitlab-duo-account
bash -n bin/pi-gitlab-duo-install

# Validate package.json parseability.
node -e 'JSON.parse(require("fs").readFileSync("package.json", "utf8")); console.log("package.json OK")'

# Secret-pattern guard for common accidental leaks. The examples/doc placeholders are allowed.
if grep -RInE 'glpat-[A-Za-z0-9_.-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}' \
  --exclude-dir=.git \
  --exclude='*.bak*' \
  .; then
  fail "potential secret pattern found"
fi

# Pi package manifest sanity.
node <<'NODE'
const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
if (!pkg.pi?.extensions?.includes('./extensions/gitlab-duo-provider')) {
  throw new Error('package.json must expose ./extensions/gitlab-duo-provider in pi.extensions');
}
if (!pkg.keywords?.includes('pi-package')) {
  throw new Error('package.json must include pi-package keyword');
}
console.log('pi package manifest OK');
NODE

echo "verify OK"
