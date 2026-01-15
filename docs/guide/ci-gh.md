# CI Analysis with GitHub CLI

Use the GitHub CLI (`gh`) to inspect CI runs without leaving the terminal.

## Quick checks

```bash
gh auth status
gh repo view --json nameWithOwner
```

## List recent runs

```bash
gh run list -L 10
gh run list --workflow "CI" -L 5
```

## Inspect a run

```bash
gh run view <run-id> --web
gh run view <run-id> --log
gh run view <run-id> --json conclusion,headBranch,headSha,url,workflowName
```

## Download artifacts

```bash
gh run download <run-id>
gh run download <run-id> --name test-results
```
