# Cowork Research Brief (Claude Desktop Max Plan)

## Sources
- https://claude.com/blog/cowork-research-preview
- https://claude.ai/download
- https://support.claude.com/en/articles/13345190-getting-started-with-cowork
- https://support.claude.com/en/articles/13364135-using-cowork-safely
- https://simonwillison.net/2026/Jan/12/claude-cowork/
- https://gist.github.com/simonw/35732f187edbe4fbd0bf976d013f22c8

## Executive Summary
Cowork brings Claude Code's agentic task model into the Claude Desktop app for knowledge work beyond coding. It is a research preview available to Max plan subscribers on macOS. Cowork emphasizes folder-scoped file access, long-running parallel task execution, and explicit user confirmation for significant actions, with added safety guidance around prompt injection and extension trust.

## Core Capabilities
- **Task mode, not chat**: Claude plans tasks, breaks work into subtasks, and executes them over time while keeping the user informed.
- **Parallel subagents**: Complex tasks can be split into parallel workstreams.
- **Long-running tasks**: Tasks can continue without conversational timeouts or context limits.
- **Folder-scoped access**: Users grant access to specific local folders; Claude can read, edit, create, and delete within that scope.
- **Connectors and tools**: Cowork can use connectors and Claude in Chrome to access external information when enabled.
- **Queueing**: Users can queue tasks and let Claude work through them in parallel, more like asynchronous coworker workflows.

## Execution Model
- Runs on the user's machine with an isolated execution environment (VM).
- Can make real changes to local files inside the user-granted scope.
- Requires the Claude Desktop app (not available on web or mobile).
- Simon Willison reports the sandbox appears to use Apple VZVirtualMachine and a custom Linux root filesystem.
- The sandbox mounts granted folders under `/sessions/<id>/mnt/...`, with separate `outputs` and `uploads` directories.
- The environment uses Bubblewrap and seccomp filters with no root capabilities, and proxies network traffic through local sockets.

## Safety and Permissions
- Users choose which folders and connectors Claude can see.
- Claude asks before significant actions; user can steer or course-correct mid-task.
- Prompt injection is a key risk, especially via web content and documents.
- Desktop extensions (MCP-like) expand capability but add risk; only trusted extensions should be enabled.
- Cowork sessions are designed to be ephemeral, with persistent data limited to the mounted workspace folders.

## Known Limitations (Parity Requirements)
- **No Projects support** in Cowork mode.
- **No cross-session memory** by default.
- **macOS-only** availability in the current preview (Windows planned).
- **No cross-device sync** in the preview phase.

## Implications for Keep-Up Agent Runtime
To align with Cowork, Keep-Up needs:
- A dedicated Cowork session mode with task lifecycle semantics (plan -> subtask -> execute -> summary).
- Folder-scoped permission enforcement at the tool execution layer.
- Long-running task orchestration and parallel subagent coordination.
- Isolation layer (VM/container abstraction) with audit logging.
- Explicit confirmation gates for destructive or high-impact actions.
- Connector and extension trust model aligned with risk guidance.
- Enforced Cowork constraints: no projects, no cross-session memory, macOS-only gating.

## Current Runtime Gap Summary
- **Present**: Subagent orchestration, task queue, MCP registry, and security policy scaffolding.
- **Missing**: Cowork task mode lifecycle, folder-grant enforcement, VM isolation, prompt injection guardrails, connector trust registry, and Cowork-specific session constraints.

## Open Questions
- What platform-level sandbox/VM strategy should Keep-Up use for local execution?
- How should connector trust be enforced (signing, allowlists, or enterprise policy)?
- What user confirmation UX is required to match Cowork's safety expectations?
