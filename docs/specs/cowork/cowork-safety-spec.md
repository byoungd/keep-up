# Cowork Safety and Permissions Spec (Phase 2)

## Purpose
Define the safety and permission model needed to match Cowork's research-preview guardrails.

## Principles
- Explicit user grants for all local data access.
- Least privilege for tools, connectors, and subagents.
- Confirm high-impact actions before execution.
- Treat web content as untrusted by default.

## Folder-Scoped Grants
- Users grant one or more root folders per session.
- File access is allowed only within granted roots.
- Default deny for hidden, system, or parent traversal paths.
- Provide a recommended "workspace" folder pattern for safer use.
- Preserve the Cowork session layout (mount root with `outputs`/`uploads`) to reduce accidental exposure.

## Confirmation Gates
### High-Impact Actions (Require Confirm)
- Delete or move files.
- Batch rename operations.
- Overwrite existing files.
- Write outside explicitly designated output directories.

### Medium-Impact Actions (Confirm if Unclear)
- Large file copies.
- Sensitive file patterns (env, keys, credentials).

## Prompt Injection Guardrails
- Treat web content and external documents as untrusted inputs.
- Apply source labels and restrictions:
  - Web: read-only by default, no action triggers.
  - Connectors: action allowed only with explicit user intent.
- Detect and suppress instruction-like content from untrusted sources.

## Connector and Extension Trust
- Maintain a trust registry for connectors and desktop extensions.
- Require explicit user opt-in per connector for Cowork sessions.
- Record connector scope and data categories accessed.

## Audit Logging
- Capture all tool calls with inputs, outputs, and timestamps.
- Record confirmation decisions and user overrides.
- Store action logs as part of the task summary.

## Sandbox Hardening Notes
- Use VM isolation where possible (VZVirtualMachine on macOS) with seccomp and namespace isolation.
- Route network traffic through local proxies so allowlists can be enforced and audited.

## Anomaly Detection (Baseline)
- Flag task scope creep (file access outside stated intent).
- Flag unexpected network access or connector usage.
- Flag repeated destructive operations.

## Parity Constraints
- Cowork must default to no cross-session memory.
- Cowork sessions must not use Projects.
- macOS-only availability until explicit expansion.

## Open Questions
- What policy engine should define allow/deny rules (static config vs policy DSL)?
- How should risk labels be surfaced in UI without excessive prompts?
