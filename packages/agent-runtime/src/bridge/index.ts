/**
 * Bridge Module
 *
 * Bridges between @reader/core AI-Native types and agent-runtime.
 */

// Agent type mapping
export {
  mapCoreAgentToRuntime,
  mapRuntimeAgentToCore,
  getCoreCapabilitiesForRuntime,
  runtimeAgentHasCapability,
  isValidCoreAgentType,
  isValidRuntimeAgentType,
} from "./agentMapping";

// Intent bridge
export {
  IntentBridge,
  createIntentBridge,
  type IntentBridgeConfig,
} from "./intentBridge";

// Stream bridge
export {
  StreamBridge,
  createStreamBridge,
  isDocumentEditEvent,
  createAITokenEvent,
  type StreamBridgeConfig,
  type DocumentEditEvent,
  type AITokenEvent,
  type ExtendedStreamEvent,
} from "./streamBridge";
