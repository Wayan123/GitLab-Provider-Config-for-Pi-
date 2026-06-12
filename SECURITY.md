# Security Policy

## Reporting a vulnerability

If you find a security issue in this package, please open a private security advisory on GitHub if available, or contact the repository owner through GitHub.

Do not include real GitLab tokens, OAuth tokens, private keys, or account secrets in public issues.

## Token handling

This package is designed to keep tokens outside the repository. Runtime credentials may be written to local user files such as:

```txt
~/.gitlab/storage.json
~/.pi/agent/auth.json
~/.pi/agent/gitlab-duo-profiles/*.json
```

These files must never be committed.

## Recommended token scopes

For GitLab Personal Access Tokens, use the minimum required scopes:

```txt
api
ai_features
read_repository
```

Only add `write_repository` if the account intentionally needs write access.

## If a token is exposed

1. Revoke the token in GitLab immediately.
2. Create a replacement token.
3. Remove the leaked token from any logs or repositories.
4. If the token was committed, rewrite repository history and rotate the token even if the commit was deleted.
