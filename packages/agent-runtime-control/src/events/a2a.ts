/**
 * Agent-to-Agent (A2A) Adapter
 *
 * Maps A2A envelopes onto the runtime message bus for cross-agent collaboration.
 */

import type { MessageEnvelope, RuntimeMessageBus } from "@ku0/agent-runtime-core";

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

export interface A2ACapabilityEntry {
  agentId: string;
  capabilities: string[];
  lastSeen: number;
}

export class A2ACapabilityRegistry {
  private readonly entries = new Map<string, A2ACapabilityEntry>();

  register(agentId: string, capabilities: string[]): A2ACapabilityEntry {
    const entry = {
      agentId,
      capabilities,
      lastSeen: Date.now(),
    };
    this.entries.set(agentId, entry);
    return entry;
  }

  get(agentId: string): A2ACapabilityEntry | undefined {
    return this.entries.get(agentId);
  }

  list(): A2ACapabilityEntry[] {
    return Array.from(this.entries.values());
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

export interface A2AAdapterOptions {
  capabilityTopic?: string;
}

export type A2ARequestHandler = (envelope: A2AEnvelope) => Promise<unknown> | unknown;

export class A2AMessageBusAdapter {
  private readonly bus: RuntimeMessageBus;
  private readonly capabilityTopic: string;
  readonly capabilities = new A2ACapabilityRegistry();
  private counter = 0;

  constructor(bus: RuntimeMessageBus, options: A2AAdapterOptions = {}) {
    this.bus = bus;
    this.capabilityTopic = options.capabilityTopic ?? "a2a.capabilities";

    this.bus.subscribe(this.capabilityTopic, (message) => {
      const envelope = this.extractEnvelope(message);
      if (!envelope || !Array.isArray(envelope.capabilities)) {
        return;
      }
      this.capabilities.register(envelope.from, envelope.capabilities);
    });
  }

  async request(
    from: string,
    to: string,
    payload: unknown,
    options?: { conversationId?: string; timeoutMs?: number; capabilities?: string[] }
  ): Promise<A2AEnvelope> {
    const envelope = this.createEnvelope({
      from,
      to,
      type: "request",
      payload,
      conversationId: options?.conversationId,
      capabilities: options?.capabilities,
    });

    const response = await this.bus.request(from, to, envelope, options?.timeoutMs);
    return (
      this.extractEnvelope(response) ??
      this.createEnvelope({
        from: response.from,
        to: response.to ?? undefined,
        type: "response",
        payload: response.payload,
        conversationId: options?.conversationId,
      })
    );
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
    const envelope = this.createEnvelope({
      from,
      to: null,
      type: "event",
      payload,
      capabilities,
    });
    this.bus.publish(from, topic, envelope);
  }

  broadcastCapabilities(agentId: string, capabilities: string[]): void {
    const envelope = this.createEnvelope({
      from: agentId,
      to: null,
      type: "event",
      payload: { capabilities },
      capabilities,
    });
    this.bus.publish(agentId, this.capabilityTopic, envelope);
  }

  registerAgent(agentId: string, handler: A2ARequestHandler): () => void {
    return this.bus.registerAgent(agentId, async (message) => {
      const envelope = this.extractEnvelope(message);
      if (!envelope) {
        return;
      }

      const responsePayload = await handler(envelope);
      if (responsePayload === undefined) {
        return;
      }

      if (message.correlationId) {
        this.respond(agentId, message.correlationId, responsePayload, envelope);
      }
    });
  }

  resolveAgentForCapability(capability: string): string | undefined {
    return this.capabilities.findByCapability(capability)?.agentId;
  }

  private createEnvelope(input: {
    from: string;
    to?: string | null;
    type: A2AMessageType;
    payload: unknown;
    conversationId?: string;
    capabilities?: string[];
    requestId?: string;
  }): A2AEnvelope {
    this.counter += 1;
    const id = `a2a_${Date.now().toString(36)}_${this.counter.toString(36)}`;

    return {
      id,
      requestId: input.requestId ?? (input.type === "request" ? id : undefined),
      from: input.from,
      to: input.to,
      type: input.type,
      conversationId: input.conversationId,
      capabilities: input.capabilities,
      payload: input.payload,
      timestamp: Date.now(),
    };
  }

  private extractEnvelope(message: MessageEnvelope): A2AEnvelope | null {
    const payload = message.payload;
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const envelope = payload as A2AEnvelope;
    if (!envelope.id || !envelope.from || !envelope.type) {
      return null;
    }

    return {
      ...envelope,
      trace: {
        correlationId: message.correlationId,
        parentId: envelope.trace?.parentId,
      },
    };
  }
}
