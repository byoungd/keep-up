# Track CB: Multi-Channel Unified Routing

> Priority: P0
> Status: Proposed
> Owner: Platform Engineering
> Dependencies: Track CA (Gateway Control Plane)
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Implement multi-channel message routing with a unified channel interface,
allowing multiple messaging surfaces (WebSocket, HTTP, future channels) to
connect through the Gateway with consistent routing and access control.

---

## Scope

- Channel plugin interface with lifecycle hooks
- Unified routing contract (`gatewayMethods`, `allowFrom`, `dmPolicy`)
- Channel registration and discovery
- Message routing from channel to session
- DM pairing and access control
- Channel status and health reporting

---

## Out of Scope

- External messaging platforms (WhatsApp, Telegram, etc.)
- Channel-specific UI components
- Gateway protocol (Track CA)

---

## Implementation Spec (Executable)

1) Define Channel Interface

- Create `packages/gateway/src/channels/types.ts`:
  - `ChannelPlugin`: id, name, gatewayMethods, lifecycle hooks
  - `ChannelConfig`: allowFrom, dmPolicy, groups
  - `RoutingContext`: channelId, sessionKey, peerId

2) Implement Channel Registry

- Create `packages/gateway/src/channels/registry.ts`:
  - Register/unregister channel plugins
  - List active channels with status
  - Channel discovery via Gateway protocol

3) Implement Message Router

- Create `packages/gateway/src/routing/router.ts`:
  - Route inbound messages to appropriate session
  - Apply access control (allowFrom, dmPolicy)
  - Handle DM pairing flow for unknown senders

4) Add Channel Lifecycle Management

- Start/stop channels independently
- Channel health probes
- Logout/reconnect handling

5) Implement Built-in Channels

- WebSocket channel (already via Gateway)
- HTTP API channel (for webhooks/integrations)

---

## Deliverables

- `packages/gateway/src/channels/` - Channel interface and registry
- `packages/gateway/src/routing/` - Message router
- Channel plugin documentation
- Unit tests for routing and access control

---

## Acceptance Criteria

- Channels can be registered and discovered via Gateway
- Messages are routed to correct sessions based on channel config
- Access control enforces allowFrom and dmPolicy
- Unknown senders receive pairing code when dmPolicy="pairing"
- Channel status visible in health endpoint

---

## Validation

```bash
pnpm --filter @ku0/gateway test

# Manual validation
# 1. Register a test channel
# 2. Send message from allowed sender → routed
# 3. Send message from unknown sender → pairing flow
```
