# Testing Guide

This document outlines the testing strategy and standards for the Keep-Up project.

## Testing Levels

### 1. Unit Tests
- **Location**: `packages/*/src/**/__tests__/*.test.ts`
- **Tool**: [Vitest](https://vitest.dev/)
- **Command**: `pnpm test:unit`
- **Focus**: Individual functions, classes, and logic.

### 2. Integration Tests
- **Location**: `packages/agent-runtime/src/__tests__/*.test.ts`
- **Tool**: Vitest
- **Focus**: Interaction between components (e.g., orchestrator and tools).

### 3. E2E Tests
- **Location**: `tests/e2e/*.spec.ts`
- **Tool**: [Playwright](https://playwright.dev/)
- **Command**: `pnpm test:e2e`
- **Focus**: User journeys and full system integration.

## Rigorous Testing Standards

To ensure high-quality coding capabilities, all new features must include rigorous test cases covering:

### Boundary Conditions
- **Empty Inputs**: Strings, arrays, objects.
- **Null/Undefined**: Proper handling of missing data.
- **Extreme Values**: Large file sizes, long paths, maximum concurrent tasks.
- **Invalid Formats**: Malformed JSON, incorrect file extensions.

### Concurrency & Race Conditions
- Test shared state with concurrent access using `Promise.all`.
- Verify behavior during simultaneous file writes and watcher events.

### Error Resilience
- **Propagation**: Ensure errors are caught at the right level.
- **Cleanup**: Verify resources (temp files, handles) are released on failure.
- **Feedback**: Confirm error messages are descriptive and helpful.

## Common Boundary Cases for Coding Tools

| Tool | Boundary Cases |
|------|----------------|
| `read_file` | File doesn't exist, file is too large, symlink loops. |
| `write_file` | Path is a directory, permission denied, parent dir missing. |
| `edit_file` | Target text not found, multiple occurrences, malformed diff. |
| `bash_exec` | Command timeout, massive output buffer, toxic commands. |

## Running Tests

```bash
# Run all unit tests
pnpm test

# Run specific package tests
pnpm --filter @ku0/agent-runtime test

# Run E2E tests
pnpm test:e2e
```
