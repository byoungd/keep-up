# Keep-Up CLI Guide

This guide covers the `keepup` CLI for running Open Wrap agents from the terminal.

## Installation

Build from the repo root:

```bash
pnpm --filter @ku0/cli build
```

The binary entrypoint is `keepup` (from `packages/cli`).

## Quick Start

Run a one-shot prompt:

```bash
keepup agent run "Summarize the repo structure"
```

Shorthand (same as `keepup agent run`):

```bash
keepup run "Summarize the repo structure"
```

Use `--prompt` for scripting:

```bash
keepup agent run --prompt "Summarize the repo structure"
```

Start an interactive session:

```bash
keepup agent tui
```

## Configuration

Configuration is stored in `~/.keep-up/cli-config.json` (override with `KEEPUP_STATE_DIR`).

Common keys:
- `provider`: `auto`, `openai`, `claude`, `gemini`, etc.
- `model`: model identifier or `auto`
- `output`: `text`, `json`, `markdown`
- `session`: default session ID for run/tui
- `approvalMode`: `ask`, `auto`, `deny`
- `sandbox`: `auto` (future use)

Set and unset values:

```bash
keepup agent config show
keepup agent config set provider openai
keepup agent config set output json
keepup agent config unset output
```

Environment overrides:
- `KEEPUP_PROVIDER`
- `KEEPUP_MODEL`
- `KEEPUP_OUTPUT`
- `KEEPUP_SESSION`
- `KEEPUP_APPROVAL_MODE`
- `KEEPUP_SANDBOX`

## Sessions

List sessions:

```bash
keepup agent session list
```

List all sessions:

```bash
keepup agent session list --all
```

Limit session list:

```bash
keepup agent session list --limit 25
```

Resume a session:

```bash
keepup agent session resume <session-id>
```

Continue a session directly:

```bash
keepup agent run --session <session-id> "Continue where we left off"
keepup agent tui --session <session-id>
```

Export a session record:

```bash
keepup agent session export <session-id> --output session.json
```

Delete a session:

```bash
keepup agent session delete <session-id>
```

## Approvals

By default, approvals prompt interactively. Use `--approval auto` to auto-approve
or `--approval deny` to deny.

```bash
keepup agent run "Refactor the parser" --approval auto
```

Use `--json` for machine-readable output:

```bash
keepup agent run "Summarize tests" --json
```

JSON output includes `sessionId`, the full `state`, `toolCalls`, and `approvals`.
Non-text outputs suppress progress logs to keep output machine-readable.

Use `--format markdown` for a structured markdown response:

```bash
keepup agent run "Summarize tests" --format markdown
```

Disable streaming progress output:

```bash
keepup agent run "Summarize tests" --no-stream
```

Suppress progress output entirely:

```bash
keepup agent run "Summarize tests" --quiet
```

## Exit Codes

- `0`: success
- `2`: agent runtime error
- `3`: approval rejected or timed out
- `4`: tool call failed

## Project Instructions (AGENTS.md / CLAUDE.md)

If `AGENTS.md` or `CLAUDE.md` exists in the current directory, the CLI injects it as
system instructions. Override with:

```bash
keepup agent run "Review the API" --instructions "Use functional style."
```

Include instructions from multiple directories (repeatable):

```bash
keepup agent run "Review the API" --add-dir ../shared --add-dir ~/work/standards
```

Instructions are concatenated in order (current directory first, then `--add-dir`),
deduplicated by file path, and labeled with their relative path. Each file is
separated by `---`.

## Doctor and Completion

Check environment and configuration:

```bash
keepup doctor
```

Generate shell completions:

```bash
keepup completion bash
keepup completion zsh
keepup completion fish
```
