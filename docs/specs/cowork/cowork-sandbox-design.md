# Cowork Sandbox Adapter Design (Phase 3)

## Purpose
Define how agent-runtime should enforce folder-scoped access and confirmation gates while executing Cowork tasks locally.

## Goals
- Enforce folder grants with no path escape.
- Route all file and network operations through a guard.
- Require confirmation for high-impact actions.
- Produce a complete audit trail per task.

## Architecture Overview
The Sandbox Adapter wraps the tool runner and file system driver. It evaluates policies, requests confirmation, and logs all actions.

### Components
- GrantManager: stores folder grants and output roots per session.
- PathResolver: canonicalizes paths and blocks traversal and symlink escapes.
- PolicyEngine: evaluates the Policy DSL and returns decisions.
- ConfirmationBroker: blocks execution until approved.
- FileSystemDriver: performs read, write, create, delete, rename, move.
- AuditLogger: writes action logs and confirmation outcomes.

## Execution Flow (File Operation)
1. Tool requests a file action with path and intent.
2. PathResolver normalizes path and checks grant scope.
3. PolicyEngine evaluates rules and returns decision.
4. If decision requires confirmation, ConfirmationBroker blocks for approval.
5. FileSystemDriver executes action only if approved.
6. AuditLogger records request, decision, and outcome.

## Interfaces (Draft)
```ts
interface SandboxAdapter {
  readFile(request: FileRequest): Promise<FileResponse>;
  writeFile(request: FileRequest): Promise<FileResponse>;
  deleteFile(request: FileRequest): Promise<FileResponse>;
  moveFile(request: MoveRequest): Promise<FileResponse>;
  listFiles(request: ListRequest): Promise<ListResponse>;
}

interface FileRequest {
  sessionId: string;
  taskId: string;
  path: string;
  intent: "read" | "write" | "create" | "delete" | "rename" | "move";
  sizeHint?: number;
}

interface MoveRequest extends FileRequest {
  destinationPath: string;
}
```

## Security Invariants
- Default deny for any path outside granted roots.
- Resolve real paths and reject symlink escapes.
- Deny hidden/system paths by default unless explicitly granted.
- Deny cross-root moves and renames.
- Require confirmation for delete, move, rename, and overwrite.

## Edge Cases
- Case-insensitive file systems should compare normalized paths.
- Atomic writes should use temp files inside output roots.
- Large file operations may require explicit confirmation.
- Batch operations should surface aggregated risk tags.

## Logging and Audit
- Record tool call inputs and outputs.
- Record policy decision and rule id.
- Record confirmation prompts and user responses.
- Emit summary entries compatible with TaskSummary.

## Observed Cowork Sandbox Details
- Simon Willison reports Cowork runs inside a Linux VM created via Apple VZVirtualMachine.
- The VM appears to use Bubblewrap, seccomp filters, and no root capabilities.
- Network access is proxied through local sockets (HTTP and SOCKS), enabling monitoring and allowlisting.
- Session storage is mounted at `/sessions/<id>/mnt`, with `outputs` and `uploads` directories for user data.

## Alignment Notes
- Mirrors Cowork's folder-scoped access and confirmation gates.
- Keeps decisions local and deterministic to match CRDT sync safety.
- Avoids automatic elevation when grants are missing.

## Open Questions
- Should network access be routed through the same adapter or a separate gateway?
- How should background subagents inherit grants and policies?
