# Agent Runtime Sandbox Design

## Purpose
Define how agent-runtime should enforce folder-scoped access and confirmation gates while executing Cowork tasks locally, and document the Docker sandbox network enforcement used by the agent runtime.

## Goals
- Enforce folder grants with no path escape.
- Route all file and network operations through a guard.
- Require confirmation for high-impact actions.
- Produce a complete audit trail per task.
- Enforce outbound network restrictions via allowlists.

## Architecture Overview
The Sandbox Adapter wraps the tool runner and file system driver. It evaluates policies, requests confirmation, and logs all actions.

### Components
- **GrantManager**: stores folder grants and output roots per session.
- **PathResolver**: canonicalizes paths and blocks traversal and symlink escapes.
- **PolicyEngine**: evaluates the Policy DSL and returns decisions.
- **ConfirmationBroker**: blocks execution until approved.
- **FileSystemDriver**: performs read, write, create, delete, rename, move.
- **AuditLogger**: writes action logs and confirmation outcomes.

## Execution Flow (File Operation)
1. Tool requests a file action with path and intent.
2. PathResolver normalizes path and checks grant scope.
3. PolicyEngine evaluates rules and returns decision.
4. If decision requires confirmation, ConfirmationBroker blocks for approval.
5. FileSystemDriver executes action only if approved.
6. AuditLogger records request, decision, and outcome.

## Network Security (Docker Sandbox)

### Network Allowlist
The Docker sandbox enforces outbound network restrictions when `SandboxPolicy.network` is set to `allowlist`:
- The container starts with `bridge` networking only if a non-empty allowlist is provided.
- A firewall script (iptables + ipset) is applied inside the container to restrict outbound traffic to resolved allowlist IPs.
- The container runs with `no-new-privileges`, and extra capabilities are only granted when the allowlist is active.

### Policy Mapping
- `network: "none"` -> `NetworkMode: none` (no network access).
- `network: "allowlist"` with hosts -> `NetworkMode: bridge` + firewall allowlist.
- `network: "allowlist"` without hosts -> `NetworkMode: none` (fail closed).
- `network: "full"` -> `NetworkMode: bridge` (no firewall allowlist).

### Allowlist Enforcement
- Runs inside the container as root after startup.
- Resolves hostnames via `dig` (A records only) and loads IPs into an ipset.
- Drops all outbound traffic by default, then allows only allowlisted IPs.
- Keeps DNS and loopback open for resolution and local communication.
- Applies TCP/UDP reject rules for clear failure behavior.

### Image Requirements
The sandbox image must include:
- `iptables`
- `ipset`
- `dig` (via `bind-tools` on Alpine)
- `iproute2`

The provided `packages/agent-runtime-sandbox/src/sandbox/Dockerfile.agent` includes these dependencies.

### Known Limitations
- IPv6 is not currently allowlisted.
- Hostnames without a dot are rejected (except `localhost`).
- Allowlist is based on DNS resolution at setup time; IPs can drift over time.

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
- Cowork runs inside a Linux VM created via Apple VZVirtualMachine.
- The VM appears to use Bubblewrap, seccomp filters, and no root capabilities.
- Network access is proxied through local sockets (HTTP and SOCKS), enabling monitoring and allowlisting.
- Session storage is mounted at `/sessions/<id>/mnt`, with `outputs` and `uploads` directories for user data.

## Alignment Notes
- Mirrors Cowork's folder-scoped access and confirmation gates.
- Keeps decisions local and deterministic to match CRDT sync safety.
- Avoids automatic elevation when grants are missing.
