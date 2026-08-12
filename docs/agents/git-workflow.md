# Git workflow

`develop` is the default branch and the integration branch — all work lands there.
`main` holds released state and advances only by merging `develop`.

```
feature/*  ──▶  develop  ──▶  main
                   ▲             ▲
            everything      only develop
```

## Rules

- **Branch off `develop`**, never off `main`.
- **Target `develop`.** It is the repo default, so `gh pr create` with no `--base` is
  already correct. Passing `--base main` from anything other than `develop` is a mistake.
- **Only `develop` may target `main`.** A release is one PR, `develop` → `main`, and
  nothing else. A PR into `main` from any other branch is failed by CI
  (`.github/workflows/branch-policy.yml`) and cannot be merged.
- **Never force-push or delete `main` or `develop`.** Both are blocked server-side.
- **Never rewrite history on `develop`.** Other sessions branch off it.

## What is enforced server-side

Ruleset `protected-branches` on `refs/heads/main` and `refs/heads/develop`:

| Rule                        | Effect                                                 |
| --------------------------- | ------------------------------------------------------ |
| `deletion`                  | The branch cannot be deleted                            |
| `non_fast_forward`          | No force-push                                           |
| `pull_request`              | Merges go through a PR; 0 approval; threads resolved    |

Ruleset `main-source-branch` on `refs/heads/main` adds the required status check
`source-must-be-develop`, which is what actually makes the source-branch rule binding —
GitHub has no native rule for restricting a PR's head branch, hence the workflow.

Both rulesets carry one bypass actor: the **repository admin** role, in `always` mode.

## Bypass is not a shortcut

The repo owner's token bypasses every rule above, which means a direct
`git push origin main` from a session using that token **will succeed silently**. That
bypass exists for an emergency the owner decides on — not for saving a PR.

If you are an agent and a push to `main` or `develop` succeeds, that is not evidence you
were allowed to make it. Open the PR.

## Inspecting the current state

```bash
gh api /repos/Emerging-it-guillaume/Claude-Session-Beacon/rulesets \
  --jq '.[] | {id, name, enforcement}'

# rules actually in force on a given branch
gh api /repos/Emerging-it-guillaume/Claude-Session-Beacon/rules/branches/main \
  --jq '[.[].type]'
```
