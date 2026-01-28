# Track CE: Session Isolation & Sandboxing

> Priority: P1
> Status: Proposed
> Owner: Agent Runtime + Security
> Dependencies: Track CA (Gateway Control Plane)
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Implement session isolation following the Main/Non-Main pattern. Main sessions
have full host access, while non-main sessions run in sandboxed environments
with restricted tool access.

---

## Scope

- Session key schema with isolation level
- Main session detection (direct user, workspace owner)
- Sandbox mode selection (none, workspace-write, docker)
- Per-session tool allowlist/denylist
- Docker sandbox adapter integration
- Sandbox escalation with user approval

---

## Out of Scope

- Policy rule evaluation (Track CF)
- Container orchestration
- Multi-tenant isolation

---

## Implementation Spec (Executable)

1) Define Session Isolation Schema

- Extend session schema in `packages/cowork/src/session/types.ts`:
  - `isolationLevel`: 'main' | 'sandbox' | 'restricted'
  - `sandboxMode`: 'none' | 'workspace-write' | 'docker'
  - `toolAllowlist`: string[], `toolDenylist`: string[]

2) Implement Isolation Resolver

- Create `packages/cowork/src/session/isolation.ts`:
  - Determine isolation level from session context
  - Main: direct user with workspace access
  - Sandbox: group chats, channels, untrusted sources
  - Apply default tool restrictions per level

3) Integrate Sandbox Adapter

- Use existing `sandbox-rs` for Docker execution
- Configure per-session container with:
  - Mounted workspace (read-only or read-write)
  - Network isolation options
  - Resource limits

4) Implement Escalation Flow

- If sandbox denies action, prompt for escalation
- User approval elevates isolation for single action
- Audit log records escalation events

5) Add Session Status Tracking

- Track active sessions with isolation status
- Surface in Gateway health endpoint
- Emit session lifecycle events

---

## Deliverables

- `packages/cowork/src/session/isolation.ts` - Isolation resolver
- Sandbox integration tests
- Session status endpoint
- Documentation for isolation model

---

## Acceptance Criteria

- Main sessions execute with full tool access
- Non-main sessions restricted to allowlist
- Docker sandbox used for high-isolation sessions
- Escalation prompts work via Gateway protocol
- Session isolation visible in status

---

## Validation

```bash
pnpm --filter @ku0/cowork test

# Manual: Create non-main session, verify tool restrictions apply
```
