# GitLab Provider Config for Pi

A public Pi package that adds a **GitLab Duo CLI** model provider to Pi CLI and ships safe setup helpers for GitLab Duo accounts, fallback workspaces, and profile switching.

> Security notice: this repository does **not** contain tokens. Never commit `~/.gitlab/storage.json`, `~/.pi/agent/auth.json`, or any profile file that contains a GitLab token.

---

## Features

- Adds GitLab Duo models to Pi's model selector, for example:
  ```txt
  gitlab-duo/claude_fable_5
  gitlab-duo/claude_sonnet_4_6
  gitlab-duo/gpt_5
  gitlab-duo/gpt_5_codex
  gitlab-duo/kimi_k2_6_fireworks
  gitlab-duo/minimax_m2_7_fireworks
  gitlab-duo/glm_5_1_fireworks
  ```
- Integrates with Pi `/login`:
  ```txt
  /login
  → Use a subscription
    → GitLab Duo CLI
      → Use existing Duo CLI login/config
      → Login in browser (OAuth link)
      → Create/paste GitLab token

  /login
  → Use an API key
    → GitLab Duo CLI
  ```
- Automatically uses a GitLab repository when the current project has a GitLab remote.
- Falls back to a safe local workspace for local, GitHub, or non-GitLab projects.
- Provides account/profile helper commands for switching GitLab accounts.
- Avoids personal defaults; public installs must provide their own `group/project` path.

---

## Requirements

### 1. Pi CLI

```bash
pi --version
```

### 2. GitLab Duo CLI

```bash
npm install -g @gitlab/duo-cli@latest
duo --version
```

### 3. GitLab Duo access

In your GitLab group:

```txt
Group → Settings → GitLab Duo
```

Enable:

```txt
GitLab Duo Core: Enabled
Experiment and beta features: Enabled
```

You must be a group Owner to change these settings.

---

## Install with Pi CLI

Recommended public install:

```bash
pi install git:github.com/Wayan123/GitLab-Provider-Config-for-Pi-
```

Equivalent HTTPS form:

```bash
pi install https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
```

Reload or restart Pi:

```txt
/reload
```

Check that models are visible:

```bash
pi --list-models gitlab-duo
```

---

## Install from a local clone

```bash
git clone https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
cd GitLab-Provider-Config-for-Pi-
pi install .
```

Temporary one-run test without permanent install:

```bash
pi -e . --list-models gitlab-duo
```

---

## Install helper commands with npm

This repository is npm-compatible. If it has not been published to the npm registry, install helper commands directly from GitHub:

```bash
npm install -g github:Wayan123/GitLab-Provider-Config-for-Pi-
```

Available helper commands:

```bash
pi-gitlab-duo-account --help
pi-gitlab-duo-install --help
```

Important: `npm install -g` installs helper commands only. To load the provider into Pi, still run:

```bash
pi install git:github.com/Wayan123/GitLab-Provider-Config-for-Pi-
```

If this package is later published to npm, Pi install can use:

```bash
pi install npm:gitlab-provider-config-for-pi
```

---

## First-time configuration

Choose a GitLab group/project that belongs to the GitLab account you want Duo to use.

Example placeholder:

```txt
my-group/my-project
```

Configure the fallback workspace:

```bash
pi-gitlab-duo-install my-group/my-project
```

If you did not install helper commands globally, run from the package directory:

```bash
./extensions/gitlab-duo-provider/install.sh my-group/my-project
```

This writes:

```txt
~/.pi/agent/gitlab-duo-provider.json
```

and creates a fallback workspace under:

```txt
~/.pi/agent/tmp/gitlab-duo-workspace
```

---

## Authentication options

### Option A: Pi `/login`

Inside Pi:

```txt
/login
```

Choose subscription-style login:

```txt
Use a subscription
→ GitLab Duo CLI
```

Then choose one of:

```txt
Use existing Duo CLI login/config
Login in browser (OAuth link)
Create/paste GitLab token
```

Or use standard API-key login:

```txt
/login
→ Use an API key
→ GitLab Duo CLI
```

For a GitLab Personal Access Token, select these scopes:

```txt
api
ai_features
read_repository
```

Optional if you need Git push/write operations:

```txt
write_repository
```

### Option B: profile helper

Print a token creation URL:

```bash
pi-gitlab-duo-account link
```

Add a profile:

```bash
pi-gitlab-duo-account add work my-group/my-project
```

Switch to that profile:

```bash
pi-gitlab-duo-account switch work
```

Inspect profiles:

```bash
pi-gitlab-duo-account current
pi-gitlab-duo-account list
```

Test the active profile:

```bash
pi-gitlab-duo-account test claude_fable_5
```

After switching accounts, reload or restart Pi:

```txt
/reload
```

---

## Verify the provider

List models:

```bash
pi --list-models gitlab-duo
```

Smoke test:

```bash
pi -p --no-tools \
  --model gitlab-duo/claude_fable_5 \
  "Reply with exactly one word: OK"
```

Expected output:

```txt
OK
```

---

## How workspace selection works

The provider chooses the Duo CLI working directory in this order:

1. If the current directory is a Git repository with a GitLab remote matching the configured base URL, use that project.
2. Otherwise, use the configured fallback workspace.
3. If Pi `/login` supplies a token from a different account, create a token-specific workspace:
   ```txt
   ~/.pi/agent/tmp/gitlab-duo-token-workspaces/<hash>
   ```

This avoids failures where a token for one account tries to use another account's stale GitLab remote.

---

## Switching GitLab accounts

Add and activate a second account:

```bash
pi-gitlab-duo-account add personal personal-group/personal-project
pi-gitlab-duo-account switch personal
```

Switch back to another profile:

```bash
pi-gitlab-duo-account switch work
```

Reload Pi after switching:

```txt
/reload
```

---

## Troubleshooting

### Token is valid, but Duo says beta features are disabled

Error:

```txt
Experimental and beta GitLab Duo features are not turned on for your group.
```

Fix: enable beta features in the default namespace/group for the active token:

```txt
Group → Settings → GitLab Duo → Experiment and beta features: Enabled
```

### Token invalid

Validate the token:

```bash
curl -sS -w "\nHTTP:%{http_code}\n" \
  --header "PRIVATE-TOKEN: YOUR_TOKEN" \
  https://gitlab.com/api/v4/personal_access_tokens/self
```

Expected:

```txt
HTTP:200
```

If the result is `401`, create a new token.

### Group not found / stale group

Error:

```txt
404 Group Not Found
```

Common causes:

- The token belongs to a different GitLab account.
- The fallback project points to a group the active account cannot access.
- The active profile is not the one you expected.

Fix:

```bash
pi-gitlab-duo-account current
pi-gitlab-duo-account switch <profile>
pi-gitlab-duo-install accessible-group/accessible-project
```

### Models do not appear

Reload Pi:

```txt
/reload
```

Then:

```bash
pi --list-models gitlab-duo
```

---

## Full account setup guide

See:

```txt
docs/ACCOUNT_SETUP.md
```

---

## Development

Clone:

```bash
git clone https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
cd GitLab-Provider-Config-for-Pi-
```

Verify:

```bash
npm run verify
```

Install local package into Pi:

```bash
pi install .
```

Test without permanent install:

```bash
pi -e . -p --no-tools --model gitlab-duo/claude_fable_5 "Reply with exactly one word: OK"
```

---

## Package structure

```txt
.
├── package.json
├── README.md
├── docs/
│   └── ACCOUNT_SETUP.md
├── extensions/
│   └── gitlab-duo-provider/
│       ├── index.ts
│       ├── account.sh
│       └── install.sh
├── bin/
│   ├── pi-gitlab-duo-account
│   └── pi-gitlab-duo-install
└── scripts/
    └── verify.sh
```

---

## Security guidance for public use

- Never commit GitLab tokens or OAuth tokens.
- Never commit `~/.gitlab/storage.json`.
- Never commit `~/.pi/agent/auth.json`.
- Never commit files from `~/.pi/agent/gitlab-duo-profiles/`.
- If a token is exposed, revoke it immediately in GitLab and create a replacement token.
- Review any Pi package before installing it; Pi extensions run with local user permissions.
