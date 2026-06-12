# Complete GitLab Duo Account Setup for Pi CLI

This guide explains how to configure a new GitLab account so it can be used by the `gitlab-duo/*` provider in Pi CLI.

> Do not write real tokens in this document. Paste tokens only into Pi `/login` prompts or local helper scripts.

---

## 1. Overview

The provider uses this local Pi extension:

```txt
extensions/gitlab-duo-provider/index.ts
```

The extension calls GitLab Duo CLI:

```txt
duo
```

A working account needs:

1. A verified GitLab account.
2. A GitLab group where the user is Owner.
3. A project inside that group.
4. GitLab Duo Core enabled for the group.
5. Experimental and beta GitLab Duo features enabled for the group.
6. A valid token or OAuth login.
7. A fallback Git workspace for non-GitLab projects.

---

## 2. Security model

Local sensitive files may include tokens:

```txt
~/.gitlab/storage.json
~/.pi/agent/auth.json
~/.pi/agent/gitlab-duo-profiles/*.json
```

Recommended permissions:

```txt
0600 for token files
0700 for profile directories
```

Never commit these files to a public repository.

---

## 3. Create a new GitLab account

1. Open:
   ```txt
   https://gitlab.com
   ```
2. Create or sign in to an account.
3. Verify the account email address.

---

## 4. Create a group

Create a group from:

```txt
GitLab → Groups → New group
```

Example placeholder:

```txt
my-group
```

The active user must be **Owner** of the group.

---

## 5. Create a project

Create a blank project in the group.

Example placeholder:

```txt
my-group/my-project
```

The project may be empty. It only needs to exist and be accessible to the active GitLab account.

---

## 6. Enable GitLab Duo for the group

Open the group settings, not the project settings:

```txt
Group → Settings → GitLab Duo
```

Enable:

```txt
GitLab Duo Core: Enabled
Experiment and beta features: Enabled
```

If the menu is not visible:

1. Confirm that you are on the group page, not the project page.
2. Confirm that your role is Owner.
3. Try the direct URL:
   ```txt
   https://gitlab.com/groups/<group-path>/-/settings/gitlab_duo
   ```

---

## 7. Create a token

### Required scopes

```txt
api
ai_features
read_repository
```

Optional for repository write/push workflows:

```txt
write_repository
```

### Create a token from the helper

```bash
pi-gitlab-duo-account link
```

Open the printed URL, create the token, then copy it once. GitLab will not show the token again.

### Validate a token manually

```bash
curl -sS -w "\nHTTP:%{http_code}\n" \
  --header "PRIVATE-TOKEN: YOUR_TOKEN" \
  https://gitlab.com/api/v4/personal_access_tokens/self
```

Expected:

```txt
HTTP:200
```

If the response is `401`, the token is wrong, expired, revoked, or missing required scopes.

---

## 8. Install the Pi package

```bash
pi install git:github.com/Wayan123/GitLab-Provider-Config-for-Pi-
```

Reload Pi:

```txt
/reload
```

---

## 9. Configure the fallback project

Use the group/project created earlier:

```bash
pi-gitlab-duo-install my-group/my-project
```

If helper commands are not installed globally, run from the package directory:

```bash
./extensions/gitlab-duo-provider/install.sh my-group/my-project
```

This creates or updates:

```txt
~/.pi/agent/gitlab-duo-provider.json
```

Example public-safe config:

```json
{
  "baseUrl": "https://gitlab.com",
  "defaultProjectPath": "my-group/my-project",
  "defaultWorkspace": "/home/USER/.pi/agent/tmp/gitlab-duo-workspace",
  "preferProjectGitLabRemote": true,
  "fallbackToDefaultWorkspace": true,
  "logLevel": "debug"
}
```

---

## 10. Authenticate from Pi `/login`

Inside Pi:

```txt
/login
```

Choose one of these flows.

### Flow A: subscription-style GitLab Duo login

```txt
Use a subscription
→ GitLab Duo CLI
```

Then choose:

```txt
Use existing Duo CLI login/config
Login in browser (OAuth link)
Create/paste GitLab token
```

### Flow B: API key login

```txt
Use an API key
→ GitLab Duo CLI
```

Paste the GitLab token when prompted.

After login, reload Pi if needed:

```txt
/reload
```

---

## 11. Authenticate with profile helper

Add a profile:

```bash
pi-gitlab-duo-account add work my-group/my-project
```

Switch to that profile:

```bash
pi-gitlab-duo-account switch work
```

Inspect the active profile:

```bash
pi-gitlab-duo-account current
```

List profiles:

```bash
pi-gitlab-duo-account list
```

Test the active profile:

```bash
pi-gitlab-duo-account test claude_fable_5
```

Expected output:

```txt
OK
```

---

## 12. Verify from Pi CLI

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

## 13. Switch accounts

Add another account:

```bash
pi-gitlab-duo-account add personal personal-group/personal-project
```

Switch to it:

```bash
pi-gitlab-duo-account switch personal
```

Switch back:

```bash
pi-gitlab-duo-account switch work
```

Reload Pi after switching:

```txt
/reload
```

---

## 14. Troubleshooting

### Token length is zero

If you used:

```bash
--api-key "$GITLAB_TOKEN"
```

but `GITLAB_TOKEN` is empty, the provider receives no usable token.

Check:

```bash
echo "TOKEN_LEN=${#GITLAB_TOKEN}"
```

If it is zero, use `/login` or profile switching instead.

### Invalid token

Error:

```txt
Token is invalid or expired. Reason: invalid_token
```

Validate the token with:

```bash
curl -sS -w "\nHTTP:%{http_code}\n" \
  --header "PRIVATE-TOKEN: YOUR_TOKEN" \
  https://gitlab.com/api/v4/personal_access_tokens/self
```

Expected:

```txt
HTTP:200
```

### Group not found

Error:

```txt
404 Group Not Found
Failed to verify access to experimental and beta GitLab Duo features
```

Common causes:

- The token belongs to a different account.
- The configured fallback project points to a group the token cannot access.
- The active profile is not the expected profile.

Fix:

```bash
pi-gitlab-duo-account current
pi-gitlab-duo-account switch <correct-profile>
pi-gitlab-duo-install accessible-group/accessible-project
```

### Beta features are disabled

Error:

```txt
Experimental and beta GitLab Duo features are not turned on for your group.
```

Fix:

```txt
Group → Settings → GitLab Duo → Experiment and beta features: Enabled
```

Make sure this is the default group/namespace for the active token.

### Current directory is not a GitLab repo

The provider should automatically fall back to the configured workspace. If it still fails, reconfigure:

```bash
pi-gitlab-duo-install my-group/my-project
```

---

## 15. New-account checklist

```txt
[ ] GitLab account email is verified
[ ] Group is created
[ ] User is Owner of the group
[ ] Project is created in the group
[ ] GitLab Duo Core is enabled
[ ] Experiment and beta features are enabled
[ ] Token has api + ai_features + read_repository scopes
[ ] Pi package is installed
[ ] Fallback project is configured
[ ] Profile is added or /login is completed
[ ] Pi is reloaded/restarted
[ ] account helper test returns OK
[ ] Pi smoke test returns OK
```

---

## 16. Quick command reference

```bash
# Install package into Pi
pi install git:github.com/Wayan123/GitLab-Provider-Config-for-Pi-

# Configure fallback project
pi-gitlab-duo-install my-group/my-project

# Create token URL
pi-gitlab-duo-account link

# Add account profile
pi-gitlab-duo-account add work my-group/my-project

# Switch account profile
pi-gitlab-duo-account switch work

# Inspect current profile
pi-gitlab-duo-account current

# Test Duo CLI
pi-gitlab-duo-account test claude_fable_5

# Test Pi provider
pi -p --no-tools --model gitlab-duo/claude_fable_5 "Reply with exactly one word: OK"
```
