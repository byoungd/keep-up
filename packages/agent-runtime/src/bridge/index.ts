/**
 * Bridge Module
 *
 * Bridges between @reader/core AI-Native types and agent-runtime.
 */

// Agent type mapping
export {
  getCoreCapabilitiesForRuntime,
  isValidCoreAgentType,
  isValidRuntimeAgentType,
  mapCoreAgentToRuntime,
  mapRuntimeAgentToCore,
  runtimeAgentHasCapability,
} from "./agentMapping";

// Intent bridge
export {
  createIntentBridge,
  IntentBridge,
  type IntentBridgeConfig,
} from "./intentBridge";

// Stream bridge
export {
  type AITokenEvent,
  createAITokenEvent,
  createStreamBridge,
  type DocumentEditEvent,
  type ExtendedStreamEvent,
  isDocumentEditEvent,
  StreamBridge,
  type StreamBridgeConfig,
} from "./streamBridge";
