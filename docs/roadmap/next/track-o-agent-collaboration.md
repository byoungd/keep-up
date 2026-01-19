# Track O: Agent-to-Agent Collaboration

**Owner**: Runtime Developer  
**Status**: Proposed  
**Priority**: 🟡 High  
**Timeline**: Week 2-4  
**Dependencies**: Track N1  
**Reference**: CrewAI roles, LangGraph multi-agent, OpenCode agent tool

---

## Objective

Enable cross-framework agent collaboration via standard A2A protocol with capability discovery and message routing.

---

## Source Analysis

### From OpenCode (agent tool pattern)

```go
// From internal/llm/tools.go - agent delegation
type AgentTool struct {
    Name        string `json:"name"`
    Description string `json:"description"`
}

// Agent spawns sub-agents for specialized tasks
func (a *Agent) delegateToAgent(prompt string) (*AgentResult, error) {
    subAgent := NewAgent(a.config)
    subAgent.SetRole("sub-agent")
    return subAgent.Run(prompt)
}
```

### From CrewAI (role-based collaboration)

```python
# Role-based agent creation with skill matching
class Agent:
    role: str
    goal: str
    backstory: str
    tools: List[Tool]
    
    def delegate_work(self, task: Task, context: str) -> TaskOutput:
        # Match task to agent with best matching skills
        best_agent = self.crew.find_best_agent(task)
        return best_agent.execute(task, context)
```

---

## Tasks

### O1: A2A Protocol Implementation (Week 2)

**Goal**: Define and implement A2A envelope schema for cross-agent communication.

**Implementation**:

```typescript
// packages/agent-runtime-control/src/a2a/envelope.ts

export interface A2AEnvelope {
  /** Unique identifier for this message */
  messageId: string;
  
  /** ID of the originating agent */
  sourceAgentId: string;
  
  /** ID of the target agent(s) */
  targetAgentId: string | string[];
  
  /** Conversation thread identifier */
  conversationId: string;
  
  /** Parent message ID for reply threading */
  inReplyTo?: string;
  
  /** Message type */
  type: "request" | "response" | "notification" | "error";
  
  /** Capabilities required to handle this message */
  requiredCapabilities?: string[];
  
  /** Message payload */
  payload: A2APayload;
  
  /** Metadata for tracing and routing */
  metadata: A2AMetadata;
}

export interface A2APayload {
  /** The action or query being requested */
  action: string;
  
  /** Parameters for the action */
  parameters?: Record<string, unknown>;
  
  /** Result data (for responses) */
  result?: unknown;
  
  /** Error information (for error type) */
  error?: A2AError;
}

export interface A2AMetadata {
  /** Timestamp of message creation */
  timestamp: number;
  
  /** Correlation ID for distributed tracing */
  correlationId: string;
  
  /** Hop count for routing loops detection */
  hopCount: number;
  
  /** Maximum hops allowed */
  maxHops: number;
  
  /** Priority level */
  priority: "low" | "normal" | "high" | "critical";
  
  /** TTL in milliseconds */
  ttlMs?: number;
}

export function createA2AEnvelope(
  sourceAgentId: string,
  targetAgentId: string,
  action: string,
  parameters?: Record<string, unknown>
): A2AEnvelope {
  return {
    messageId: generateId(),
    sourceAgentId,
    targetAgentId,
    conversationId: generateId(),
    type: "request",
    payload: { action, parameters },
    metadata: {
      timestamp: Date.now(),
      correlationId: generateId(),
      hopCount: 0,
      maxHops: 10,
      priority: "normal",
    },
  };
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-control/src/a2a/envelope.ts`
- [ ] `packages/agent-runtime-control/src/a2a/serializer.ts`
- [ ] JSON Schema for validation
- [ ] Protocol documentation

---

### O2: Cross-Agent Messaging (Week 3)

**Goal**: Extend RuntimeMessageBus with A2A transport adapter.

**Implementation**:

```typescript
// packages/agent-runtime-control/src/messageBus/a2aAdapter.ts

import { RuntimeMessageBus } from "./messageBus";
import { A2AEnvelope } from "../a2a/envelope";

export interface A2ATransport {
  send(envelope: A2AEnvelope): Promise<void>;
  receive(): AsyncGenerator<A2AEnvelope>;
  close(): Promise<void>;
}

export class A2AMessageBusAdapter {
  private messageBus: RuntimeMessageBus;
  private transports = new Map<string, A2ATransport>();
  private pendingResponses = new Map<string, {
    resolve: (response: A2AEnvelope) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(messageBus: RuntimeMessageBus) {
    this.messageBus = messageBus;
    this.setupInternalRouting();
  }

  async registerTransport(agentId: string, transport: A2ATransport): Promise<void> {
    this.transports.set(agentId, transport);
    this.startReceiving(agentId, transport);
  }

  async sendMessage(envelope: A2AEnvelope): Promise<A2AEnvelope | void> {
    // Increment hop count
    envelope.metadata.hopCount++;
    
    // Check for routing loops
    if (envelope.metadata.hopCount > envelope.metadata.maxHops) {
      throw new Error("Max hop count exceeded - possible routing loop");
    }

    // Local agent?
    if (this.isLocalAgent(envelope.targetAgentId as string)) {
      return this.routeLocally(envelope);
    }

    // Remote agent
    const transport = this.transports.get(envelope.targetAgentId as string);
    if (!transport) {
      throw new Error(`No transport for agent ${envelope.targetAgentId}`);
    }

    await transport.send(envelope);

    // For requests, wait for response
    if (envelope.type === "request") {
      return this.waitForResponse(envelope.messageId, envelope.metadata.ttlMs);
    }
  }

  private async waitForResponse(messageId: string, ttlMs = 30000): Promise<A2AEnvelope> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error("A2A response timeout"));
      }, ttlMs);

      this.pendingResponses.set(messageId, { resolve, reject, timeout });
    });
  }

  private async routeLocally(envelope: A2AEnvelope): Promise<A2AEnvelope | void> {
    // Emit on internal message bus
    this.messageBus.emit("a2a:message", {
      envelope,
      timestamp: Date.now(),
    });
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-control/src/messageBus/a2aAdapter.ts`
- [ ] Local and remote transport implementations
- [ ] Correlation ID propagation
- [ ] Timeout and retry handling

---

### O3: Capability Discovery (Week 4)

**Goal**: Dynamic discovery of agent capabilities for intelligent delegation.

**Implementation**:

```typescript
// packages/agent-runtime-control/src/discovery/capabilities.ts

export interface AgentCapability {
  /** Unique capability identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Detailed description */
  description: string;
  
  /** Capability category */
  category: "code" | "analysis" | "search" | "browser" | "shell" | "custom";
  
  /** Required tools */
  requiredTools: string[];
  
  /** Skill level (0-1) */
  proficiency: number;
  
  /** Resource requirements */
  resources?: {
    memory?: string;
    gpu?: boolean;
    network?: boolean;
  };
}

export interface AgentProfile {
  agentId: string;
  name: string;
  version: string;
  capabilities: AgentCapability[];
  status: "available" | "busy" | "offline";
  lastSeen: number;
  metadata?: Record<string, unknown>;
}

export class CapabilityRegistry {
  private agents = new Map<string, AgentProfile>();
  private capabilityIndex = new Map<string, Set<string>>(); // capability -> agentIds

  register(profile: AgentProfile): void {
    this.agents.set(profile.agentId, profile);
    
    for (const capability of profile.capabilities) {
      if (!this.capabilityIndex.has(capability.id)) {
        this.capabilityIndex.set(capability.id, new Set());
      }
      this.capabilityIndex.get(capability.id)!.add(profile.agentId);
    }
  }

  findAgentsWithCapability(capabilityId: string): AgentProfile[] {
    const agentIds = this.capabilityIndex.get(capabilityId) || new Set();
    return Array.from(agentIds)
      .map(id => this.agents.get(id)!)
      .filter(agent => agent.status === "available");
  }

  findBestAgent(requiredCapabilities: string[]): AgentProfile | undefined {
    const candidates = this.agents.values();
    
    let bestAgent: AgentProfile | undefined;
    let bestScore = 0;

    for (const agent of candidates) {
      if (agent.status !== "available") continue;
      
      const score = this.calculateMatchScore(agent, requiredCapabilities);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  private calculateMatchScore(agent: AgentProfile, required: string[]): number {
    let score = 0;
    const agentCapIds = new Set(agent.capabilities.map(c => c.id));
    
    for (const req of required) {
      if (agentCapIds.has(req)) {
        const cap = agent.capabilities.find(c => c.id === req)!;
        score += cap.proficiency;
      }
    }
    
    return score / required.length;
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-control/src/discovery/capabilities.ts`
- [ ] `packages/agent-runtime-control/src/discovery/skillMatcher.ts`
- [ ] Agent heartbeat and status tracking
- [ ] Trust scoring for external agents

---

## Acceptance Criteria

- [ ] A2A envelopes serialize/deserialize correctly
- [ ] Local and remote message routing works
- [ ] Correlation IDs propagate through hops
- [ ] Capability discovery finds matching agents
- [ ] Timeout and error handling is robust
- [ ] Audit log records all A2A exchanges

---

## Testing Requirements

```bash
# Unit tests
pnpm --filter @ku0/agent-runtime-control test -- --grep "a2a"

# Integration tests with two local agents
pnpm test:integration -- --grep "multi-agent"
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Routing loops | High | Hop count limit, visited set |
| Capability mismatch | Medium | Strict schema validation |
| Timeout cascades | Medium | Per-hop timeout budgets |
