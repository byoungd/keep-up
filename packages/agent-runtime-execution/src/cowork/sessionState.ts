/**
 * Cowork Session State
 *
 * Session state helper that disables cross-session memory.
 */

import { InMemorySessionState, type SessionStateConfig } from "../session";
import { NoopMemoryManager } from "./memory";

export function createCoworkSessionState(config: Omit<SessionStateConfig, "memoryManager"> = {}) {
  return new InMemorySessionState({
    ...config,
    memoryManager: new NoopMemoryManager(),
  });
}
