#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$HOME/.pi/agent"
PROFILES_DIR="$BASE_DIR/gitlab-duo-profiles"
WORKSPACES_DIR="$BASE_DIR/tmp/gitlab-duo-workspaces"
PROVIDER_CONFIG="$BASE_DIR/gitlab-duo-provider.json"
DUO_STORAGE="$HOME/.gitlab/storage.json"
DEFAULT_BASE_URL="${GITLAB_BASE_URL:-${GITLAB_URL:-https://gitlab.com}}"
DEFAULT_SCOPES="api,ai_features,read_repository"

mkdir -p "$PROFILES_DIR" "$WORKSPACES_DIR" "$(dirname "$DUO_STORAGE")"
chmod 700 "$PROFILES_DIR" "$WORKSPACES_DIR" 2>/dev/null || true

usage() {
  cat <<'EOF'
GitLab Duo account/profile manager for Pi

Usage:
  account.sh link [base-url]
  account.sh add <profile> <group/project> [base-url]
  account.sh switch <profile>
  account.sh list
  account.sh current
  account.sh test [model]
  account.sh remove <profile>

Examples:
  account.sh link
  account.sh add work my-group/my-project
  account.sh switch work
  account.sh test claude_fable_5

Notes:
  - `link` prints a GitLab web URL to create a PAT.
  - PAT scopes needed: api + ai_features + read_repository.
  - Tokens are stored in ~/.pi/agent/gitlab-duo-profiles/*.json and ~/.gitlab/storage.json.
EOF
}

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().rstrip("\n")))'
}

profile_path() {
  local name="$1"
  if [[ ! "$name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Invalid profile name: $name" >&2
    exit 2
  fi
  echo "$PROFILES_DIR/$name.json"
}

pat_link() {
  local base="${1:-$DEFAULT_BASE_URL}"
  local encoded_name="GitLab%20Duo%20Pi"
  # GitLab may not pre-check every scope from query params on all versions, so verify manually.
  echo "${base%/}/-/user_settings/personal_access_tokens?name=${encoded_name}&scopes=${DEFAULT_SCOPES}"
}

write_profile() {
  local name="$1" project="$2" base="$3" token="$4"
  local path
  path="$(profile_path "$name")"
  local workspace="$WORKSPACES_DIR/$name"
  PROFILE_NAME="$name" PROJECT_PATH="$project" BASE_URL="$base" TOKEN="$token" WORKSPACE="$workspace" PROFILE_PATH="$path" python3 - <<'PY'
import json, os
path = os.environ['PROFILE_PATH']
data = {
  'name': os.environ['PROFILE_NAME'],
  'baseUrl': os.environ['BASE_URL'],
  'projectPath': os.environ['PROJECT_PATH'],
  'workspace': os.environ['WORKSPACE'],
  'token': os.environ['TOKEN'],
}
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
os.chmod(path, 0o600)
PY
  echo "$path"
}

ensure_workspace() {
  local workspace="$1" base="$2" project="$3"
  local remote="${base%/}/${project#/}.git"
  mkdir -p "$workspace"
  if ! git -C "$workspace" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$workspace" init >/dev/null
  fi
  if git -C "$workspace" remote get-url origin >/dev/null 2>&1; then
    git -C "$workspace" remote set-url origin "$remote"
  else
    git -C "$workspace" remote add origin "$remote"
  fi
}

activate_profile() {
  local name="$1"
  local path
  path="$(profile_path "$name")"
  if [[ ! -f "$path" ]]; then
    echo "Profile not found: $name" >&2
    exit 1
  fi

  PROFILE_PATH="$path" PROVIDER_CONFIG="$PROVIDER_CONFIG" DUO_STORAGE="$DUO_STORAGE" AUTH_JSON="$HOME/.pi/agent/auth.json" python3 - <<'PY'
import json, os, pathlib, stat, time
profile = json.load(open(os.environ['PROFILE_PATH']))
provider_config = os.environ['PROVIDER_CONFIG']
duo_storage = os.environ['DUO_STORAGE']
auth_json = os.environ['AUTH_JSON']

# Update Pi provider config.
provider = {
  'baseUrl': profile['baseUrl'],
  'defaultProjectPath': profile['projectPath'],
  'defaultWorkspace': profile['workspace'],
  'preferProjectGitLabRemote': True,
  'fallbackToDefaultWorkspace': True,
  'logLevel': 'debug',
  'activeProfile': profile['name'],
}
pathlib.Path(provider_config).parent.mkdir(parents=True, exist_ok=True)
with open(provider_config, 'w') as f:
    json.dump(provider, f, indent=2)
    f.write('\n')
os.chmod(provider_config, 0o600)

# Update Duo CLI static-token config while preserving unrelated keys.
pathlib.Path(duo_storage).parent.mkdir(parents=True, exist_ok=True)
try:
    storage = json.load(open(duo_storage))
except Exception:
    storage = {}
storage['duo-cli-config'] = {
    'gitlabAuthToken': profile['token'],
    'gitlabBaseUrl': profile['baseUrl'],
}
with open(duo_storage, 'w') as f:
    json.dump(storage, f, indent=2)
    f.write('\n')
os.chmod(duo_storage, 0o600)

# Keep Pi /login credential aligned too; otherwise a stale /login token
# overrides Duo CLI config during provider calls.
try:
    auth = json.load(open(auth_json))
except Exception:
    auth = {}
auth['gitlab-duo'] = {
    'type': 'oauth',
    'refresh': profile['token'],
    'access': profile['token'],
    'expires': int((time.time() + 365*24*60*60) * 1000),
    'source': 'profile-switch',
    'gitlabBaseUrl': profile['baseUrl'],
}
pathlib.Path(auth_json).parent.mkdir(parents=True, exist_ok=True)
with open(auth_json, 'w') as f:
    json.dump(auth, f, indent=2)
    f.write('\n')
os.chmod(auth_json, 0o600)
print(json.dumps({'workspace': profile['workspace'], 'baseUrl': profile['baseUrl'], 'projectPath': profile['projectPath']}))
PY
}

cmd="${1:-}"
case "$cmd" in
  link)
    pat_link "${2:-$DEFAULT_BASE_URL}"
    ;;
  add)
    name="${2:-}"; project="${3:-}"; base="${4:-$DEFAULT_BASE_URL}"
    if [[ -z "$name" || -z "$project" ]]; then usage; exit 2; fi
    echo "Open this URL and create a token with scopes: api, ai_features, read_repository"
    echo "$(pat_link "$base")"
    echo
    read -rsp "Paste GitLab PAT for profile '$name' (input hidden): " token
    echo
    if [[ -z "$token" ]]; then echo "Token cannot be empty" >&2; exit 2; fi
    path="$(write_profile "$name" "$project" "$base" "$token")"
    workspace="$WORKSPACES_DIR/$name"
    ensure_workspace "$workspace" "$base" "$project"
    activate_profile "$name" >/dev/null
    echo "Profile added and activated: $name"
    echo "Profile file: $path"
    echo "Workspace: $workspace"
    ;;
  switch)
    name="${2:-}"
    if [[ -z "$name" ]]; then usage; exit 2; fi
    info="$(activate_profile "$name")"
    workspace="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["workspace"])' <<<"$info")"
    base="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["baseUrl"])' <<<"$info")"
    project="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["projectPath"])' <<<"$info")"
    ensure_workspace "$workspace" "$base" "$project"
    echo "Activated GitLab Duo profile: $name"
    echo "Workspace: $workspace"
    echo "Project: ${base%/}/${project}"
    ;;
  list)
    shopt -s nullglob
    for f in "$PROFILES_DIR"/*.json; do
      PROFILE_PATH="$f" python3 - <<'PY'
import json, os
p = os.environ['PROFILE_PATH']
d = json.load(open(p))
print(f"{d.get('name')}\t{d.get('baseUrl')}/{d.get('projectPath')}\t{d.get('workspace')}")
PY
    done
    ;;
  current)
    if [[ -f "$PROVIDER_CONFIG" ]]; then
      python3 - <<PY
import json
p = '$PROVIDER_CONFIG'
d = json.load(open(p))
print('activeProfile:', d.get('activeProfile', '(none)'))
print('baseUrl:', d.get('baseUrl'))
print('defaultProjectPath:', d.get('defaultProjectPath'))
print('defaultWorkspace:', d.get('defaultWorkspace'))
PY
    else
      echo "No provider config found: $PROVIDER_CONFIG"
    fi
    ;;
  test)
    model="${2:-claude_fable_5}"
    workspace="$(python3 - <<PY
import json
p='$PROVIDER_CONFIG'
try:
 d=json.load(open(p)); print(d.get('defaultWorkspace') or '$HOME/.pi/agent/tmp/gitlab-duo-workspace')
except Exception:
 print('$HOME/.pi/agent/tmp/gitlab-duo-workspace')
PY
)"
    duo --cwd "$workspace" --model "$model" run --goal "Reply with exactly one word: OK"
    ;;
  remove)
    name="${2:-}"
    if [[ -z "$name" ]]; then usage; exit 2; fi
    rm -f "$(profile_path "$name")"
    echo "Removed profile: $name"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 2
    ;;
esac
