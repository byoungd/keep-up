# Agent Architecture Analysis: Codex and Claude Code

Date: 2026-01-21
Owner: Agent Runtime Team
Status: Active
Sources: `.tmp/analysis/codex`, `.tmp/analysis/claude-code`

---

## Executive Summary

This document captures architectural patterns from Anthropic's **Codex** (OpenAI) and **Claude Code** (Anthropic) agent implementations. Both represent production-grade agentic coding systems with distinct design philosophies.

---

## Codex Architecture (Rust)

### Overview
Codex is a **Rust monorepo** with ~45 crates covering runtime, TUI, MCP, sandboxing, and backends.

### Core Components

| Crate | Purpose |
|-------|---------|
| `codex-core` | Business logic: session, turns, tools, auth |
| `codex-protocol` | Types for CLI ↔ TUI and app-server communication |
| `codex-exec` | Command execution with timeout/sandboxing |
| `codex-tui` | Terminal UI (ratatui-based) |
| `codex-mcp-server` | MCP server implementation |
| `linux-sandbox` | Landlock-based sandboxing |
| `process-hardening` | macOS Seatbelt integration |

### Key Patterns

#### 1. Queue-Pair Interface (`Codex` struct)
```rust
impl Codex {
    fn spawn(config, auth, models, skills, history, source, control) -> CodexResult<CodexSpawnOk>
    fn submit(&self, op: Op) -> CodexResult<String>
    fn next_event(&self) -> CodexResult<Event>
    fn agent_status(&self) -> AgentStatus
}
```
- **Async channel architecture**: Submissions go in, events come out
- Maps well to our `RuntimeEventBus` pattern

#### 2. Session/Turn Management
- `Session`: One running task at a time, interruptible by user input
- `TurnContext`: Per-turn state including diff tracker, approvals
- `ActiveTurn`: Tracks in-progress agent turn

#### 3. Tool System
- **Spec-driven**: `tools/spec.rs` (94KB) defines all tool schemas
- **Router**: `tools/router.rs` dispatches to handlers
- **Orchestrator**: `tools/orchestrator.rs` for multi-tool coordination
- **Parallel execution**: `tools/parallel.rs` handles concurrent calls
- **Sandboxing**: `tools/sandboxing.rs` enforces exec policies

#### 4. Exec Policy
- `exec_policy.rs` (44KB): Comprehensive command safety analysis
- `command_safety/`: Directory handling dangerous command detection
- `seatbelt.rs`: macOS sandbox profiles (`.sbpl` files)
- `landlock.rs`: Linux kernel sandboxing

#### 5. MCP Integration
- `mcp_connection_manager.rs` (43KB): Full MCP client
- `mcp_tool_call.rs`: MCP tool invocation
- Supports stdio, SSE, and HTTP transports

---

## Claude Code Architecture (Node.js)

### Overview
Claude Code is a **Node.js terminal agent** with a rich plugin system.

### Plugin Architecture
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json      # Metadata
├── commands/            # Slash commands
├── agents/              # Specialized agents
├── skills/              # Agent skills
├── hooks/               # Event handlers
├── .mcp.json            # MCP server config
└── README.md
```

### Key Patterns

#### 1. Plugin Types
| Type | Purpose |
|------|---------|
| **Commands** | Slash commands (e.g., `/commit`, `/code-review`) |
| **Agents** | Specialized sub-agents with their own prompts |
| **Skills** | Auto-invoked guidance for specific domains |
| **Hooks** | Event handlers (PreToolUse, SessionStart, Stop) |

#### 2. Example Plugins
- `code-review`: 5 parallel Sonnet agents for PR review
- `hookify`: Create custom hooks from conversation patterns
- `security-guidance`: PreToolUse hook monitoring 9 security patterns
- `feature-dev`: 7-phase structured development workflow

#### 3. Extensibility
- Plugins can be shared across projects
- `.claude/settings.json` for project-level config
- Marketplaces for community plugins

---

## Comparative Analysis

| Aspect | Codex (Rust) | Claude Code (Node.js) |
|--------|--------------|----------------------|
| **Language** | Rust (performance, safety) | Node.js (ecosystem, portability) |
| **Architecture** | Monolithic core + crates | Plugin-based extensibility |
| **Tool System** | Spec-driven, centralized | Distributed via plugins |
| **Sandboxing** | Deep OS integration (seatbelt/landlock) | Less emphasized |
| **MCP** | Full client implementation | Via `.mcp.json` config |
| **UI** | TUI (ratatui) | Terminal + IDE integration |
| **Extensibility** | Crate composition | Plugin system |

---

## Recommendations for Agent Runtime

### Adopt from Codex
1. **Queue-pair interface**: Our `RuntimeEventBus` already follows this
2. **Tool sandboxing**: Consider `linux-sandbox`/`seatbelt` patterns for Track AC
3. **Exec policy DSL**: Codex's command safety analysis is comprehensive
4. **Turn diff tracker**: Useful for time-travel features (Track V)

### Adopt from Claude Code
1. **Plugin system**: Consider agent-runtime extensions/plugins
2. **Hook architecture**: PreToolUse/PostToolUse hooks for policy enforcement
3. **Specialized agents**: Sub-agent patterns for code-review, feature-dev
4. **Skills concept**: Domain-specific guidance injection

### Architecture Gaps in Our Runtime
1. **No plugin system**: Currently monolithic
2. **Limited sandboxing**: Docker only, no OS-level sandboxing
3. **No hook architecture**: Policy is inline, not hookable
4. **No skills/agents registry**: Sub-agents are ad-hoc

---

## References

- Codex: `.tmp/analysis/codex/codex-rs/`
- Claude Code: `.tmp/analysis/claude-code/plugins/`
- Our roadmap: `docs/roadmap/phase-5-expansion/track-ac-policy-ops.md`
