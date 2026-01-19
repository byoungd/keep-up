/**
 * Agent Runtime Core Types
 *
 * MCP-compatible tool protocol types and agent runtime interfaces.
 */

// ============================================================================
// MCP Tool Protocol Types
// ============================================================================

/** MCP Tool definition */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  /** Optional annotations for UI/security hints */
  annotations?: {
    /** Tool category for grouping */
    category?: "core" | "knowledge" | "external" | "communication" | "control";
    /** Whether tool requires confirmation */
    requiresConfirmation?: boolean;
    /** Whether tool can modify state */
    readOnly?: boolean;
    /** Estimated execution time hint */
    estimatedDuration?: "instant" | "fast" | "medium" | "slow";
    /** Required OAuth scopes for remote MCP tools */
    requiredScopes?: string[];
  };
  /** Optional metadata for tool adapters */
  metadata?: Record<string, unknown>;
}

/** JSON Schema subset for tool parameters */
export interface JSONSchema {
  type: "object" | "string" | "number" | "boolean" | "array";
  properties?: Record<string, JSONSchemaProperty>;
  additionalProperties?: boolean;
  required?: string[];
  description?: string;
}

export interface JSONSchemaProperty {
  type?: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  oneOf?: JSONSchemaProperty[];
  default?: unknown;
  /** Properties for nested objects */
  properties?: Record<string, JSONSchemaProperty>;
  /** Required fields for nested objects */
  required?: string[];
  /** Whether to allow extra properties (default: true) */
  additionalProperties?: boolean;
}

/** MCP Tool call request */
export interface MCPToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** MCP Tool call result */
export interface MCPToolResult {
  success: boolean;
  content: ToolContent[];
  error?: ToolError;
  /** Execution metadata */
  meta?: {
    durationMs: number;
    toolName: string;
    sandboxed: boolean;
  };
}

/** Tool content types */
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; uri: string; mimeType?: string };

/** Tool error structure */
export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: unknown;
}

export type ToolErrorCode =
  | "EXECUTION_FAILED"
  | "TIMEOUT"
  | "PERMISSION_DENIED"
  | "PERMISSION_ESCALATION_REQUIRED"
  | "INVALID_ARGUMENTS"
  | "SANDBOX_VIOLATION"
  | "RESOURCE_NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "DRYRUN_REJECTED"
  | "RETRY_EXHAUSTED"
  | "VALIDATION_ERROR"
  | "PROMPT_INJECTION_BLOCKED"
  | "DUPLICATE_FAILED_ACTION"; // Manus spec: prevent repeating exact same failed action

// ============================================================================
// Tool Server Interface (MCP Server)
// ============================================================================

/** MCP Tool Server interface */
export interface MCPToolServer {
  /** Server name */
  readonly name: string;
  /** Server description */
  readonly description: string;
  /** List available tools */
  listTools(): MCPTool[];
  /** Execute a tool */
  callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult>;
  /** Optional: Initialize server */
  initialize?(): Promise<void>;
  /** Optional: Cleanup */
  dispose?(): Promise<void>;
}

/** Context passed to tool execution */
export interface ToolContext {
  /** Current user ID */
  userId?: string;
  /** Current session ID */
  sessionId?: string;
  /** Context ID for shared context views */
  contextId?: string;
  /** Current document ID (for LFCC tools) */
  docId?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Task graph node ID for tool call tracking */
  taskNodeId?: string;
  /** Security policy in effect */
  security: SecurityPolicy;
  /** Tool execution policy context */
  toolExecution?: ToolExecutionContext;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Audit logger */
  audit?: AuditLogger;
  /** Cowork execution context */
  cowork?: CoworkToolContext;
  /** Skill execution context */
  skills?: SkillToolContext;
  /** Optional A2A routing context */
  a2a?: A2AContext;
}

export interface CoworkToolContext {
  session: CoworkSession;
  policyEngine: CoworkPolicyEngine;
  caseInsensitivePaths?: boolean;
}

// ============================================================================
// Skill Types
// ============================================================================

export type SkillSource = "builtin" | "org" | "user" | "third_party";

export interface SkillIndexEntry {
  skillId: string;
  name: string;
  description: string;
  source: SkillSource;
  path: string;
  skillFile: string;
  hash: string;
  lastModified: string;
  metadata?: Record<string, string>;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  originUrl?: string;
}

export interface SkillActivation {
  skillId: string;
  hash: string;
  source: SkillSource;
  sessionId: string;
  taskId?: string;
  activatedAt: string;
}

export interface SkillToolContext {
  activeSkills: SkillActivation[];
}

export interface A2ARoutingConfig {
  roleToAgentId?: Record<string, string>;
  capabilityPrefix?: string;
}

export interface A2AContext {
  adapter: A2AMessageBusAdapter;
  agentId: string;
  routing?: A2ARoutingConfig;
  timeoutMs?: number;
}

// ============================================================================
// Completion Contract Types
// ============================================================================

/** Completion tool input payload */
export interface CompleteTaskInput {
  /** Required: final answer/summary */
  summary: string;
  /** Optional: list of created file paths */
  artifacts?: string[];
  /** Optional: recommendations for follow-up */
  nextSteps?: string;
}

// ============================================================================
// Security Types
// ============================================================================

import type { DataAccessPolicy, PolicyEngine } from "@ku0/core";
import type { CoworkPolicyEngine } from "../cowork/policy";
import type { CoworkSession } from "../cowork/types";
import type { A2AMessageBusAdapter } from "../events/a2a";

/** Security policy for agent execution */
export interface SecurityPolicy {
  /** Sandbox configuration */
  sandbox: SandboxConfig;
  /** Tool permissions */
  permissions: ToolPermissions;
  /** Resource limits */
  limits: ResourceLimits;
  /** Optional AI-native policy engine for fine-grained AI operation control */
  aiPolicyEngine?: PolicyEngine;
  /** Optional data access policy for AI read operations */
  dataAccessPolicy?: DataAccessPolicy;
}

export interface SandboxConfig {
  /** Sandbox type */
  type: "none" | "process" | "docker" | "wasm";
  /** Network access */
  networkAccess: "none" | "allowlist" | "full";
  /** Allowed hosts for network access */
  allowedHosts?: string[];
  /** Filesystem isolation */
  fsIsolation: "none" | "workspace" | "temp" | "full";
  /** Working directory for sandboxed execution */
  workingDirectory?: string;
}

export interface ToolPermissions {
  /** Bash execution permission */
  bash: "disabled" | "confirm" | "sandbox" | "full";
  /** File access permission */
  file: "none" | "read" | "workspace" | "home" | "full";
  /** Code execution permission */
  code: "disabled" | "sandbox" | "full";
  /** Network access permission */
  network: "none" | "allowlist" | "full";
  /** LFCC document permission */
  lfcc: "none" | "read" | "write" | "admin";
}

export interface PermissionEscalation {
  permission: keyof ToolPermissions;
  level: ToolPermissions[keyof ToolPermissions];
  resource?: string;
  reason?: string;
}

export interface ResourceLimits {
  /** Max execution time in ms */
  maxExecutionTimeMs: number;
  /** Max memory in bytes */
  maxMemoryBytes: number;
  /** Max output size in bytes */
  maxOutputBytes: number;
  /** Max concurrent tool calls */
  maxConcurrentCalls: number;
}

/** Security policy presets */
export const SECURITY_PRESETS = {
  safe: {
    sandbox: {
      type: "process" as const,
      networkAccess: "none" as const,
      fsIsolation: "workspace" as const,
    },
    permissions: {
      bash: "disabled" as const,
      file: "read" as const,
      code: "disabled" as const,
      network: "none" as const,
      lfcc: "read" as const,
    },
    limits: {
      maxExecutionTimeMs: 30_000,
      maxMemoryBytes: 256 * 1024 * 1024, // 256MB
      maxOutputBytes: 1024 * 1024, // 1MB
      maxConcurrentCalls: 3,
    },
  },
  balanced: {
    sandbox: {
      type: "process" as const,
      networkAccess: "allowlist" as const,
      fsIsolation: "workspace" as const,
    },
    permissions: {
      bash: "sandbox" as const,
      file: "workspace" as const,
      code: "sandbox" as const,
      network: "allowlist" as const,
      lfcc: "write" as const,
    },
    limits: {
      maxExecutionTimeMs: 120_000,
      maxMemoryBytes: 512 * 1024 * 1024, // 512MB
      maxOutputBytes: 10 * 1024 * 1024, // 10MB
      maxConcurrentCalls: 5,
    },
  },
  power: {
    sandbox: {
      type: "none" as const,
      networkAccess: "full" as const,
      fsIsolation: "none" as const,
    },
    permissions: {
      bash: "confirm" as const,
      file: "home" as const,
      code: "full" as const,
      network: "full" as const,
      lfcc: "write" as const,
    },
    limits: {
      maxExecutionTimeMs: 300_000,
      maxMemoryBytes: 1024 * 1024 * 1024, // 1GB
      maxOutputBytes: 50 * 1024 * 1024, // 50MB
      maxConcurrentCalls: 10,
    },
  },
  developer: {
    sandbox: {
      type: "none" as const,
      networkAccess: "full" as const,
      fsIsolation: "none" as const,
    },
    permissions: {
      bash: "full" as const,
      file: "full" as const,
      code: "full" as const,
      network: "full" as const,
      lfcc: "admin" as const,
    },
    limits: {
      maxExecutionTimeMs: 600_000,
      maxMemoryBytes: 2 * 1024 * 1024 * 1024, // 2GB
      maxOutputBytes: 100 * 1024 * 1024, // 100MB
      maxConcurrentCalls: 20,
    },
  },
} as const;

export type SecurityPreset = keyof typeof SECURITY_PRESETS;

// ============================================================================
// Audit Types
// ============================================================================

/** Audit log entry */
export interface AuditEntry {
  timestamp: number;
  toolName: string;
  action: "call" | "result" | "error";
  userId?: string;
  correlationId?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  durationMs?: number;
  sandboxed: boolean;
}

/** Audit logger interface */
export interface AuditLogger {
  log(entry: AuditEntry): void;
  getEntries(filter?: AuditFilter): AuditEntry[];
}

export interface AuditFilter {
  toolName?: string;
  userId?: string;
  correlationId?: string;
  since?: number;
  until?: number;
  action?: AuditEntry["action"];
}

// ============================================================================
// Agent Orchestrator Types
// ============================================================================

/** Tool execution policy mode */
export type ExecutionPolicy = "interactive" | "batch";

/** Tool execution policy context */
export interface ToolExecutionContext {
  /** Policy mode */
  policy: ExecutionPolicy;
  /** Tool allowlist patterns */
  allowedTools: string[];
  /** Tool patterns that require approval */
  requiresApproval: string[];
  /** Max parallel calls in batch mode */
  maxParallel: number;
  /** Optional approval timeout in milliseconds */
  approvalTimeoutMs?: number;
  /** Node-level caching configuration */
  nodeCache?: NodeCachePolicy;
}

export interface NodeCachePolicy {
  enabled: boolean;
  ttlMs?: number;
  includePolicyContext?: boolean;
}

/** Configuration for parallel tool execution */
export interface ParallelExecutionConfig {
  /** Enable parallel execution of independent tools (default: true) */
  enabled: boolean;
  /** Maximum concurrent tool calls (default: 5) */
  maxConcurrent: number;
}

export interface RuntimeCacheConfig {
  /** Default TTL for caches in milliseconds */
  ttlMs?: number;
  /** Default max entries for caches */
  maxEntries?: number;
  request?: {
    enabled?: boolean;
    ttlMs?: number;
    maxEntries?: number;
  };
  toolResult?: {
    ttlMs?: number;
    maxEntries?: number;
    maxSizeBytes?: number;
  };
}

export interface RuntimeConfig {
  cache?: RuntimeCacheConfig;
}

/** Agent configuration */
export interface AgentConfig {
  /** Agent name */
  name: string;
  /** System prompt */
  systemPrompt: string;
  /** Security policy */
  security: SecurityPolicy;
  /** Available tool servers */
  toolServers: MCPToolServer[];
  /** Max turns before stopping */
  maxTurns?: number;
  /** Whether to require confirmation for dangerous operations */
  requireConfirmation?: boolean;
  /** Tool execution policy context */
  toolExecutionContext?: ToolExecutionContext;
  /** Optional A2A routing context */
  a2a?: A2AContext;
  /** Parallel tool execution configuration */
  parallelExecution?: ParallelExecutionConfig;
  /** Planning configuration (plan-then-execute pattern) */
  planning?: {
    enabled: boolean;
    requireApproval?: boolean;
    maxRefinements?: number;
    planningTimeoutMs?: number;
    autoExecuteLowRisk?: boolean;
  };
  /** Error recovery configuration */
  recovery?: {
    enabled?: boolean;
    graceTurns?: number;
    graceTimeoutMs?: number;
    warningTemplate?: string;
    hardLimit?: boolean;
  };
  /** Tool discovery configuration */
  toolDiscovery?: {
    enabled?: boolean;
    maxResults?: number;
    minScore?: number;
  };
}

/** Agent execution state */
export interface AgentState {
  /** Current turn number */
  turn: number;
  /** Conversation messages */
  messages: AgentMessage[];
  /** Pending tool calls */
  pendingToolCalls: MCPToolCall[];
  /** Execution status */
  status: "idle" | "thinking" | "executing" | "waiting_confirmation" | "complete" | "error";
  /** Error if any */
  error?: string;
  /** Optional checkpoint identifier for persisted state */
  checkpointId?: string;
}

/** Agent message types */
export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: MCPToolCall[] }
  | { role: "tool"; toolName: string; result: MCPToolResult };

/** Confirmation request for dangerous operations */
export interface ConfirmationRequest {
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  reason?: string;
  riskTags?: string[];
  taskNodeId?: string;
  escalation?: PermissionEscalation;
}

/** Confirmation handler callback */
export type ConfirmationHandler = (request: ConfirmationRequest) => Promise<boolean>;

// ============================================================================
// Execution Metadata Types (for visualization)
// ============================================================================

/** Execution decision emitted by the execution plane */
export interface ExecutionDecision {
  decisionId: string;
  toolName: string;
  toolCallId?: string;
  taskNodeId?: string;
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  riskTags?: string[];
  escalation?: PermissionEscalation;
  sandboxed: boolean;
  affectedPaths?: string[];
}

/** Execution record emitted by the execution plane */
export interface ToolExecutionRecord {
  toolCallId?: string;
  toolName: string;
  taskNodeId?: string;
  status: "started" | "completed" | "failed";
  durationMs: number;
  affectedPaths?: string[];
  policyDecisionId?: string;
  sandboxed: boolean;
  error?: string;
}

// ============================================================================
// Artifact Types
// ============================================================================

export type ArtifactType =
  | "PlanCard"
  | "DiffCard"
  | "ReportCard"
  | "ChecklistCard"
  | "TestReport"
  | "ReviewReport";

export interface ArtifactEnvelope {
  id: string;
  type: ArtifactType;
  schemaVersion: string;
  title: string;
  payload: Record<string, unknown>;
  taskNodeId: string;
  createdAt: string;
  renderHints?: Record<string, unknown>;
}

/** Structured context frame for LLM requests */
export interface ContextFrame {
  frameId: string;
  sources: {
    shortTerm: string[];
    project: string[];
    memory: string[];
    tools: string[];
  };
  redactions: string[];
  tokenBudget: { maxTokens: number; usedTokens: number };
}

/** Detailed token usage statistics */
export interface TokenUsageStats {
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Context window size */
  contextWindow?: number;
  /** Percentage of context window used (0-100) */
  utilization?: number;
  /** Breakdown by message type */
  breakdown?: {
    system?: number;
    user?: number;
    assistant?: number;
    tool?: number;
  };
}

/** Execution step for tool call visualization */
export interface ExecutionStep {
  /** Step ID */
  id: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Execution status */
  status: "pending" | "executing" | "success" | "error";
  /** Tool result (when complete) */
  result?: MCPToolResult;
  /** Execution start time */
  startTime: number;
  /** Execution end time */
  endTime?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Whether this step was executed in parallel with others */
  parallel?: boolean;
}

/** Thinking/reasoning block for display */
export interface ThinkingBlock {
  /** Thinking content */
  content: string;
  /** Type of thinking */
  type: "reasoning" | "planning" | "reflection";
  /** Timestamp */
  timestamp: number;
  /** Whether thinking is complete */
  complete: boolean;
}

/** Context compaction event */
export interface CompressionEvent {
  /** When compression occurred */
  timestamp: number;
  /** Number of messages before compression */
  messagesBefore: number;
  /** Number of messages after compression */
  messagesAfter: number;
  /** Tokens before compression */
  tokensBefore: number;
  /** Tokens after compression */
  tokensAfter: number;
  /** Compression ratio (0-1) */
  compressionRatio: number;
  /** Strategy used */
  strategy: "sliding_window" | "summarize" | "truncate" | "hybrid";
  /** Summary of what was compressed */
  summary?: string;
}
