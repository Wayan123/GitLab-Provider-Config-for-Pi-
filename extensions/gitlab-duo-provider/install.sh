#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  cat <<'EOF'
Configure GitLab Duo fallback workspace for the Pi provider.

Usage:
  pi-gitlab-duo-install [group/project]
  install.sh [group/project]

Environment overrides:
  GITLAB_BASE_URL       Default: https://gitlab.com
  GITLAB_DUO_PROJECT_PATH
  GITLAB_DUO_CWD        Default: ~/.pi/agent/tmp/gitlab-duo-workspace

Example:
  pi-gitlab-duo-install future-org-group/future-org-project
EOF
  exit 0
fi

PROJECT_PATH="${1:-${GITLAB_DUO_PROJECT_PATH:-future-org-group/future-org-project}}"
BASE_URL="${GITLAB_BASE_URL:-${GITLAB_URL:-https://gitlab.com}}"
WORKSPACE="${GITLAB_DUO_CWD:-$HOME/.pi/agent/tmp/gitlab-duo-workspace}"
CONFIG="$HOME/.pi/agent/gitlab-duo-provider.json"
REMOTE_URL="${BASE_URL%/}/${PROJECT_PATH#/}.git"

mkdir -p "$(dirname "$CONFIG")" "$WORKSPACE"

python3 - <<PY
import json, os
config_path = os.path.expanduser("$CONFIG")
data = {
  "baseUrl": "$BASE_URL",
  "defaultProjectPath": "$PROJECT_PATH",
  "defaultWorkspace": "$WORKSPACE",
  "preferProjectGitLabRemote": True,
  "fallbackToDefaultWorkspace": True,
  "logLevel": "debug",
}
with open(config_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(config_path)
PY

if ! git -C "$WORKSPACE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$WORKSPACE" init >/dev/null
fi

if git -C "$WORKSPACE" remote get-url origin >/dev/null 2>&1; then
  git -C "$WORKSPACE" remote set-url origin "$REMOTE_URL"
else
  git -C "$WORKSPACE" remote add origin "$REMOTE_URL"
fi

cat <<EOF
GitLab Duo Pi provider configured.

Config:    $CONFIG
Workspace: $WORKSPACE
Remote:    $REMOTE_URL

Next:
  1. Make sure Duo CLI works: duo --cwd "$WORKSPACE" --model claude_fable_5 run --goal "Jawab hanya satu kata: OK"
  2. Reload/restart Pi.
  3. Use model: gitlab-duo/claude_fable_5

For a project with its own GitLab remote, Pi will use that project automatically.
For GitHub/local/non-GitLab projects, Pi falls back to the workspace above.
EOF
