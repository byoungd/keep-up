/**
 * Scoped Event Bus
 *
 * Provides a child event bus that forwards events to a parent bus
 * wrapped as "subagent:event" payloads.
 */

import {
  createEventBus,
  type EventBusConfig,
  type RuntimeEvent,
  type RuntimeEventBus,
  type SubagentEventPayload,
} from "./eventBus";

export interface ScopedEventBusOptions {
  agentId: string;
  parentId?: string;
  source?: string;
  include?: (event: RuntimeEvent) => boolean;
  config?: EventBusConfig;
}

export interface ScopedEventBus extends RuntimeEventBus {
  parent: RuntimeEventBus;
  agentId: string;
  parentId?: string;
  dispose(): void;
}

export function createScopedEventBus(
  parent: RuntimeEventBus,
  options: ScopedEventBusOptions
): ScopedEventBus {
  const child = createEventBus(options.config);
  const disposeChild = child.dispose.bind(child);
  const subscription = child.subscribe("*", (event) => {
    if (event.type === "subagent:event") {
      return;
    }
    if (options.include && !options.include(event)) {
      return;
    }
    const payload: SubagentEventPayload = {
      agentId: options.agentId,
      parentId: options.parentId,
      event,
    };
    parent.emit("subagent:event", payload, {
      source: options.source ?? options.agentId,
      correlationId: options.parentId ?? event.meta.correlationId,
      priority: event.meta.priority,
    });
  });

  return Object.assign(child, {
    parent,
    agentId: options.agentId,
    parentId: options.parentId,
    dispose: () => {
      subscription.unsubscribe();
      disposeChild();
    },
  });
}
