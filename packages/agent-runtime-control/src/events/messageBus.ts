/**
 * Runtime Message Bus
 *
 * Provides inter-agent messaging with send/publish/respond semantics.
 * Reference: spec Control Plane - RuntimeMessageBus
 */

import { createEventBus, type RuntimeEventBus } from "./eventBus";

// ============================================================================
// Types
// ============================================================================

/** Message envelope for inter-agent communication */
export interface MessageEnvelope {
  /** Unique message ID */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID (null for broadcast) */
  to: string | null;
  /** Message type */
  type: "request" | "response" | "event";
  /** Topic for pub/sub (used with type: 'event') */
  topic?: string;
  /** Message payload */
  payload: unknown;
  /** Correlation ID for request/response matching */
  correlationId?: string;
  /** Timestamp */
  timestamp: number;
}

/** Subscription handle */
export interface MessageSubscription {
  id: string;
  topic: string;
  unsubscribe: () => void;
}

/** Message handler function */
export type MessageHandler = (envelope: MessageEnvelope) => void | Promise<void>;

/** Pending request for response tracking */
interface PendingRequest {
  resolve: (envelope: MessageEnvelope) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// ============================================================================
// RuntimeMessageBus
// ============================================================================

/**
 * Inter-agent messaging system.
 */
export class RuntimeMessageBus {
  private readonly eventBus: RuntimeEventBus;
  private readonly subscriptions = new Map<string, Set<MessageHandler>>();
  private readonly directHandlers = new Map<string, MessageHandler>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private messageCounter = 0;
  private subscriptionCounter = 0;

  constructor(eventBus?: RuntimeEventBus) {
    this.eventBus = eventBus ?? createEventBus();

    // Subscribe to internal message events
    this.eventBus.subscribe("message:delivered", (event) => {
      const envelope = event.payload as MessageEnvelope;
      this.deliverMessage(envelope);
    });
  }

  /**
   * Generate a unique message ID.
   */
  private generateMessageId(): string {
    this.messageCounter++;
    return `msg-${Date.now().toString(36)}-${this.messageCounter}`;
  }

  /**
   * Generate a unique subscription ID.
   */
  private generateSubscriptionId(): string {
    this.subscriptionCounter++;
    return `sub-${this.subscriptionCounter}`;
  }

  /**
   * Send a direct message to a specific agent.
   */
  send(from: string, to: string, payload: unknown): MessageEnvelope {
    const envelope: MessageEnvelope = {
      id: this.generateMessageId(),
      from,
      to,
      type: "request",
      payload,
      timestamp: Date.now(),
    };

    this.eventBus.emitRaw("message:delivered", envelope);
    return envelope;
  }

  /**
   * Send a request and wait for response.
   */
  async request(
    from: string,
    to: string,
    payload: unknown,
    timeoutMs = 30000
  ): Promise<MessageEnvelope> {
    const correlationId = this.generateMessageId();

    const envelope: MessageEnvelope = {
      id: this.generateMessageId(),
      from,
      to,
      type: "request",
      payload,
      correlationId,
      timestamp: Date.now(),
    };

    return new Promise<MessageEnvelope>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout });

      this.eventBus.emitRaw("message:delivered", envelope);
    });
  }

  /**
   * Respond to a request.
   */
  respond(from: string, correlationId: string, payload: unknown): MessageEnvelope {
    const envelope: MessageEnvelope = {
      id: this.generateMessageId(),
      from,
      to: null, // Response goes back via correlation
      type: "response",
      payload,
      correlationId,
      timestamp: Date.now(),
    };

    this.eventBus.emitRaw("message:delivered", envelope);
    return envelope;
  }

  /**
   * Publish an event to a topic (broadcast).
   */
  publish(from: string, topic: string, payload: unknown): MessageEnvelope {
    const envelope: MessageEnvelope = {
      id: this.generateMessageId(),
      from,
      to: null,
      type: "event",
      topic,
      payload,
      timestamp: Date.now(),
    };

    this.eventBus.emitRaw("message:delivered", envelope);
    return envelope;
  }

  /**
   * Subscribe to a topic.
   */
  subscribe(topic: string, handler: MessageHandler): MessageSubscription {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }

    this.subscriptions.get(topic)?.add(handler);

    const id = this.generateSubscriptionId();

    return {
      id,
      topic,
      unsubscribe: () => {
        const handlers = this.subscriptions.get(topic);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.subscriptions.delete(topic);
          }
        }
      },
    };
  }

  /**
   * Register a handler for direct messages to a specific agent.
   */
  registerAgent(agentId: string, handler: MessageHandler): () => void {
    this.directHandlers.set(agentId, handler);
    return () => {
      this.directHandlers.delete(agentId);
    };
  }

  /**
   * Wait for a response with a specific correlation ID.
   */
  async waitFor(correlationId: string, timeoutMs = 30000): Promise<MessageEnvelope> {
    // Check if already pending
    const existing = this.pendingRequests.get(correlationId);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.resolve = resolve;
        existing.reject = reject;
      });
    }

    return new Promise<MessageEnvelope>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Timed out waiting for response: ${correlationId}`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout });
    });
  }

  /**
   * Internal: Deliver a message to appropriate handlers.
   */
  private deliverMessage(envelope: MessageEnvelope): void {
    // Handle responses to pending requests
    if (envelope.type === "response" && envelope.correlationId) {
      const pending = this.pendingRequests.get(envelope.correlationId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(envelope.correlationId);
        pending.resolve(envelope);
        return;
      }
    }

    // Deliver to direct recipient
    if (envelope.to) {
      const handler = this.directHandlers.get(envelope.to);
      if (handler) {
        void Promise.resolve(handler(envelope));
      }
    }

    // Deliver to topic subscribers
    if (envelope.topic) {
      const handlers = this.subscriptions.get(envelope.topic);
      if (handlers) {
        for (const handler of handlers) {
          void Promise.resolve(handler(envelope));
        }
      }
    }
  }

  /**
   * Get current stats.
   */
  getStats(): {
    pendingRequests: number;
    activeSubscriptions: number;
    registeredAgents: number;
  } {
    let totalSubscribers = 0;
    for (const handlers of this.subscriptions.values()) {
      totalSubscribers += handlers.size;
    }

    return {
      pendingRequests: this.pendingRequests.size,
      activeSubscriptions: totalSubscribers,
      registeredAgents: this.directHandlers.size,
    };
  }

  /**
   * Dispose all subscriptions and pending requests.
   */
  dispose(): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Message bus disposed"));
    }
    this.pendingRequests.clear();
    this.subscriptions.clear();
    this.directHandlers.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new RuntimeMessageBus.
 */
export function createMessageBus(eventBus?: RuntimeEventBus): RuntimeMessageBus {
  return new RuntimeMessageBus(eventBus);
}
