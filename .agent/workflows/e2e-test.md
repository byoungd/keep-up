---
description: Run targeted E2E tests based on the area of code changed
---

# Targeted E2E Testing Workflow

Use this workflow to run E2E tests efficiently. **Always prefer targeted tests over full suite.**

## Step 1: Identify the affected area

Before running tests, determine which area of the code was changed:

| Changed Files | Test Command |
|---------------|--------------|
| `editor/`, `ProseMirror`, `schema`, `marks` | `pnpm test:e2e:core` |
| `block/`, `NodeView`, drag/drop | `pnpm test:e2e:blocks` |
| `collab/`, `sync`, WebSocket, CRDT | `pnpm test:e2e:collab` |
| `annotation/`, highlights, comments | `pnpm test:e2e:annotations` |
| `import/`, AI gateway, persistence | `pnpm test:e2e:features` |
| Navigation, pages | `pnpm test:e2e:smoke` |
| Accessibility | `pnpm test:e2e:a11y` |

## Step 2: Run the targeted test

// turbo
```bash
pnpm --filter @ku0/e2e-tests test:e2e
```

Or run from the directory:
```bash
cd tests/e2e
pnpm test:e2e
```

Example: If you changed editor formatting code:
```bash
pnpm test:e2e:core
```

## Step 3: If tests fail with timeouts

Timeouts are usually load-related, not logic bugs. Re-run with:

// turbo
```bash
pnpm -C tests/e2e playwright test <specific-file.spec.ts> --timeout=90000
```

## Step 4: Run full suite only for releases

Only run full E2E suite before releases or major merges:

```bash
PLAYWRIGHT_WORKERS=1 pnpm test:e2e
```

## Available Test Categories

- `test:e2e:core` - Editor, selection, cursor, formatting
- `test:e2e:blocks` - Block menu, drag & drop, reordering
- `test:e2e:collab` - WebSocket sync, multi-client, CRDT
- `test:e2e:annotations` - Highlights, handles, comments
- `test:e2e:features` - Import, AI gateway, persistence
- `test:e2e:smoke` - Smoke tests (navigation, pages)
- `test:e2e:a11y` - Accessibility smoke
