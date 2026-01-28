# Track CD: Desktop/Mobile Device Nodes

> Priority: P1
> Status: Proposed
> Owner: Platform Engineering
> Dependencies: None
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Enable desktop (Tauri) and mobile apps to expose device capabilities as nodes
that the Gateway can invoke. Nodes provide camera, screen recording, location,
and system command execution.

---

## Scope

- Node capability protocol (advertise/invoke/response)
- Tauri node adapter for desktop-tauri app
- Device capabilities: camera, screen.record, location.get, system.notify
- Node registration with Gateway
- Permission status reporting (TCC on macOS)

---

## Out of Scope

- Full iOS/Android native apps (future phase)
- Voice wake / Talk Mode (specialized UI)
- Gateway control plane (Track CA)

---

## Implementation Spec (Executable)

1) Define Node Protocol

- Create `packages/nodes/src/protocol.ts`:
  - `NodeCapability`: command, permissions, description
  - `NodeInvoke`: nodeId, command, args
  - `NodeResponse`: success, result, error
- Gateway methods: `node.list`, `node.describe`, `node.invoke`

2) Implement Node Registry

- Create `packages/gateway/src/nodes/registry.ts`:
  - Track connected nodes with capabilities
  - Presence timeout for disconnect detection
  - Route invokes to correct node

3) Implement Tauri Node Adapter

- Create `apps/desktop-tauri/src/node/adapter.rs`:
  - Connect to Gateway WebSocket
  - Advertise device capabilities
  - Handle invoke requests

4) Add Device Commands

- `camera.snap`: Capture photo from webcam
- `screen.record`: Start/stop screen recording
- `location.get`: Get current location (if permitted)
- `system.notify`: Post system notification

5) Permission Handling

- Query TCC status on macOS for each capability
- Return PERMISSION_MISSING error if denied
- Report permission status in node.describe

---

## Deliverables

- `packages/nodes/` - Node protocol and types
- `packages/gateway/src/nodes/` - Node registry
- `apps/desktop-tauri/src/node/` - Tauri adapter
- Unit tests and integration tests

---

## Acceptance Criteria

- Desktop app connects as node to Gateway
- Node capabilities visible via `node.list`
- Commands can be invoked via `node.invoke`
- Permission errors reported correctly
- Node disconnect detected via presence timeout

---

## Validation

```bash
pnpm --filter @ku0/nodes test
pnpm --filter @ku0/desktop-tauri tauri dev

# Manual: invoke node.list via Gateway, verify desktop node visible
```
