# Track O: Agent-to-Agent Collaboration

**Owner**: Runtime Developer  
**Status**: Proposed  
**Priority**: 🟡 High  
**Timeline**: Week 2-4  
**Dependencies**: Track L, Track M1, Track M4  
**Reference**: RuntimeMessageBus (Track M1), A2A adapter (`packages/agent-runtime-control/src/events/a2a.ts`), MetaGPT routing, CrewAI roles

---

## Objective

Deliver deterministic, auditable agent collaboration on top of `RuntimeMessageBus` with a canonical
A2A envelope, capability discovery, and optional remote transport bridges.

---

## Current Baseline

- `RuntimeMessageBus` in `@ku0/agent-runtime-core` provides send/request/respond/publish semantics.
- `A2AMessageBusAdapter` in `@ku0/agent-runtime-control` normalizes A2A envelopes to the bus.
- `A2AContext` is injected into orchestrator and tool execution contexts.

---

## Source Analysis

### From OpenCode (event-driven pub/sub)

```go
type Broker[T any] struct {
  subscribers []chan T
}

func (b *Broker[T]) Publish(event T) {
  for _, ch := range b.subscribers {
    ch <- event
  }
}
```

### From MetaGPT (send_to routing)

```python
msg = Message(send_to="coder", content="Implement the feature")
role.publish(msg)
```

### From CrewAI (role-based delegation)

```python
best_agent = crew.find_best_agent(task)
return best_agent.execute(task, context)
```

---

## Tasks

### O1: A2A Envelope + Core Contract (Week 2)

**Goal**: Standardize the A2A envelope shape across core/control packages and publish schema docs.

**Implementation**:

```typescript
// packages/agent-runtime-control/src/events/a2a.ts

export type A2AMessageType = "request" | "response" | "event";

export interface A2AEnvelope {
  id: string;
  requestId?: string;
  from: string;
  to?: string | null;
  type: A2AMessageType;
  conversationId?: string;
  capabilities?: string[];
  payload: unknown;
  timestamp: number;
  trace?: {
    correlationId?: string;
    parentId?: string;
  };
}
```

```typescript
// packages/agent-runtime-core/src/index.ts

export interface A2AEnvelopeLike {
  payload: unknown;
  id?: string;
  from?: string;
  to?: string | null;
  type?: string;
  requestId?: string;
  conversationId?: string;
  capabilities?: string[];
  timestamp?: number;
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-core/src/index.ts` A2A envelope/context contract.
- [ ] `packages/agent-runtime-control/src/events/a2a.ts` canonical envelope + adapter helpers.
- [ ] JSON schema for validation and interop guidance.
- [ ] Protocol documentation (field semantics, correlation IDs, TTL guidance).

---

### O2: Message Bus Routing + Remote Bridge (Week 3)

**Goal**: Route A2A envelopes through `RuntimeMessageBus` and add an optional remote bridge layer.

**Implementation**:

```typescript
// packages/agent-runtime-control/src/events/a2a.ts

export class A2AMessageBusAdapter {
  constructor(private readonly bus: RuntimeMessageBus) {}

  async request(
    from: string,
    to: string,
    payload: unknown,
    timeoutMs?: number
  ): Promise<A2AEnvelope> {
    const envelope = this.createEnvelope({ from, to, type: "request", payload });
    const response = await this.bus.request(from, to, envelope, timeoutMs);
    return this.extractEnvelope(response) ?? envelope;
  }

  respond(from: string, correlationId: string, payload: unknown, request?: A2AEnvelope): void {
    const envelope = this.createEnvelope({
      from,
      to: request?.from ?? null,
      type: "response",
      payload,
      requestId: request?.requestId ?? request?.id,
      conversationId: request?.conversationId,
    });
    this.bus.respond(from, correlationId, envelope);
  }

  publish(from: string, topic: string, payload: unknown, capabilities?: string[]): void {
    const envelope = this.createEnvelope({ from, to: null, type: "event", payload, capabilities });
    this.bus.publish(from, topic, envelope);
  }
}
```

**Deliverables**:
- [ ] Adapter routing docs (request/respond/publish mapping to A2A envelopes).
- [ ] Remote transport interface for cross-runtime bridging.
- [ ] Correlation ID propagation between message bus and A2A traces.
- [ ] Timeout and retry policy for remote requests.
- [ ] Audit log entries for outbound and inbound A2A traffic.

---

### O3: Capability Discovery + Delegation (Week 4)

**Goal**: Expand capability discovery with TTL, heartbeat, and routing policies for delegation.

**Implementation**:

```typescript
// packages/agent-runtime-control/src/events/a2a.ts

export interface A2ACapabilityEntry {
  agentId: string;
  capabilities: string[];
  lastSeen: number;
}

export class A2ACapabilityRegistry {
  private readonly entries = new Map<string, A2ACapabilityEntry>();

  register(agentId: string, capabilities: string[]): A2ACapabilityEntry {
    const entry = { agentId, capabilities, lastSeen: Date.now() };
    this.entries.set(agentId, entry);
    return entry;
  }

  findByCapability(capability: string): A2ACapabilityEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.capabilities.includes(capability)) {
        return entry;
      }
    }
    return undefined;
  }
}
```

```typescript
// packages/agent-runtime-core/src/index.ts

export interface A2ARoutingConfig {
  roleToAgentId?: Record<string, string>;
  capabilityPrefix?: string;
}
```

**Deliverables**:
- [ ] TTL/heartbeat support for capability entries.
- [ ] `A2AAdapterLike.resolveAgentForCapability` aligned with registry.
- [ ] Role-to-agent routing using `A2ARoutingConfig`.
- [ ] Delegation hooks to prefer capability-based routing.

---

## Acceptance Criteria

- [ ] A2A envelopes match core/control interfaces and validate against schema.
- [ ] RuntimeMessageBus routing preserves correlation and conversation IDs.
- [ ] Remote bridge enforces timeouts and does not bypass tool allowlists.
- [ ] Capability discovery returns live agents and prunes stale entries.
- [ ] Audit log captures A2A request/response and publish events.

---

## Testing Requirements

```bash
# Unit tests for adapter and registry
pnpm --filter @ku0/agent-runtime-control test -- --grep "a2a"

# Integration test with two local agents
pnpm test:integration -- --grep "multi-agent"
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Envelope drift | High | Publish JSON schema and validate on ingress/egress |
| Capability staleness | Medium | TTL + heartbeat pruning |
| Remote trust boundary | High | Enforce allowlists and audit every hop |
| Response timeouts | Medium | Timeout budgets and retry/backoff |
