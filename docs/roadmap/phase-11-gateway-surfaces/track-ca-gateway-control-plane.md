# Track CA: Gateway WebSocket Control Plane

> Priority: P0
> Status: Proposed
> Owner: Platform Engineering
> Dependencies: None
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Implement a unified WebSocket Gateway control plane that manages all client connections
(CLI, Web UI, Desktop, Mobile), routes messages, broadcasts events, and handles
session lifecycle. Based on Moltbot's Gateway pattern.

---

## Scope

- WebSocket server on configurable port (default :18789)
- Message envelope schema with method routing
- Client connection registry with authentication
- Event broadcast to subscribed clients
- Health check and presence heartbeat
- Gateway configuration (bind mode, TLS, auth)

---

## Out of Scope

- Channel-specific logic (Track CB)
- Policy evaluation (Track CF)
- Session isolation (Track CE)

---

## Implementation Spec (Executable)

1) Define Gateway Protocol

- Create `packages/gateway/src/protocol/envelope.ts`:
  - Message envelope: `{ id, method, params?, result?, error? }`
  - Event envelope: `{ event, payload, timestamp }`
- Define core methods: `ping`, `auth`, `subscribe`, `unsubscribe`

2) Implement Gateway Server

- Create `packages/gateway/src/server/gateway-server.ts`:
  - WebSocket server using `ws` package
  - Client registry with connection state
  - Method router for RPC-style calls
  - Event broadcast with subscription filtering

3) Add Configuration Schema

- Extend config schema for gateway options:
  - `gateway.port`, `gateway.bind`, `gateway.auth.mode`, `gateway.tls`
- Support bind modes: `loopback`, `lan`, `tailnet`, `auto`

4) Implement Client Management

- Create `packages/gateway/src/clients/client-registry.ts`:
  - Add/remove clients on connect/disconnect
  - Track client metadata (auth status, subscriptions)
  - Broadcast to filtered client sets

5) Add Health and Metrics

- Health endpoint: `GET /health` returning status JSON
- Presence heartbeat: broadcast `presence.tick` every 5s
- Connection metrics: client count, message throughput

---

## Deliverables

- `packages/gateway/src/protocol/` - Protocol definitions
- `packages/gateway/src/server/` - Gateway server implementation
- `packages/gateway/src/clients/` - Client registry
- Unit tests for protocol, server, and client management

---

## Acceptance Criteria

- Gateway starts and accepts WebSocket connections
- Clients can authenticate via token or password
- Methods are routed to registered handlers
- Events broadcast to subscribed clients only
- Health endpoint returns valid status JSON
- Unit test coverage ≥ 70%

---

## Validation

```bash
# Start gateway in test mode
pnpm --filter @ku0/gateway test

# Manual smoke test
# 1. Start gateway: pnpm gateway:dev
# 2. Connect with wscat: wscat -c ws://localhost:18789
# 3. Send: {"id":1,"method":"ping"}
# 4. Expect: {"id":1,"result":{"pong":true}}
```

---

## Single-Doc Execution Checklist

1) Create feature branch
- git checkout -b feat/track-ca-gateway-control-plane

2) Implement scope following spec above

3) Validate
- pnpm --filter @ku0/gateway test
- pnpm biome check --write

4) Commit and PR
- git commit -m "feat(gateway): implement WebSocket control plane [CA]"
