/**
 * Ghost Agent Module
 *
 * Proactive background monitoring for file changes with toast suggestions.
 */

export { createGhostAgent, GhostAgent } from "./ghostAgent";

export type {
  FileChangeEvent,
  FileChangeType,
  GhostAgentConfig,
  GhostCheckResult,
  GhostCheckType,
  GhostEvent,
  GhostEventHandler,
  GhostEventType,
  GhostIssue,
  IGhostAgent,
  ToastAction,
  ToastSuggestion,
} from "./types";
