# Agent Runtime Sandbox (Docker) - Network Allowlist

## Purpose
Document the Docker sandbox network enforcement used by the agent runtime.

## Summary
The Docker sandbox enforces outbound network restrictions when `SandboxPolicy.network` is set to `allowlist`:
- The container starts with `bridge` networking only if a non-empty allowlist is provided.
- A firewall script (iptables + ipset) is applied inside the container to restrict outbound traffic to resolved allowlist IPs.
- The container runs with `no-new-privileges`, and extra capabilities are only granted when the allowlist is active.

## Policy Mapping
- `network: "none"` -> `NetworkMode: none` (no network access).
- `network: "allowlist"` with hosts -> `NetworkMode: bridge` + firewall allowlist.
- `network: "allowlist"` without hosts -> `NetworkMode: none` (fail closed).
- `network: "full"` -> `NetworkMode: bridge` (no firewall allowlist).

## Allowlist Enforcement
- Runs inside the container as root after startup.
- Resolves hostnames via `dig` (A records only) and loads IPs into an ipset.
- Drops all outbound traffic by default, then allows only allowlisted IPs.
- Keeps DNS and loopback open for resolution and local communication.
- Applies TCP/UDP reject rules for clear failure behavior.

## Image Requirements
The sandbox image must include:
- `iptables`
- `ipset`
- `dig` (via `bind-tools` on Alpine)
- `iproute2`

The provided `packages/agent-runtime-sandbox/src/sandbox/Dockerfile.agent` includes these dependencies.

## Known Limitations
- IPv6 is not currently allowlisted.
- Hostnames without a dot are rejected (except `localhost`).
- Allowlist is based on DNS resolution at setup time; IPs can drift over time.

## Implementation Pointers
- `packages/agent-runtime-sandbox/src/sandbox/containerFactory.ts`
- `packages/agent-runtime-sandbox/src/sandbox/networkAllowlist.ts`
