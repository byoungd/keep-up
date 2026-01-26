/**
 * Agent Runtime Core Types
 *
 * MCP-compatible tool protocol types and agent runtime interfaces.
 */

import { stableStringify } from "@ku0/core";

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
    /** Policy action for Cowork policy evaluation */
    policyAction?: CoworkPolicyActionLike;
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
    outputSpool?: ToolOutputSpoolMetadata;
  };
}

/** Tool content types */
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; uri: string; mimeType?: string };

// ============================================================================
// File Context Tracking
// ============================================================================

// ============================================================================
// Code Knowledge Graph
// ============================================================================

export interface CodeSymbolDescriptor {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  container?: string;
  detail?: string;
}

export interface CodeSymbolQueryOptions {
  limit?: number;
  kinds?: string[];
}

export interface CodeSymbolQueryResult {
  symbol: CodeSymbolDescriptor;
  score: number;
}

export interface CodeKnowledgeGraph {
  querySymbols(query: string, options?: CodeSymbolQueryOptions): CodeSymbolQueryResult[];
  getSymbolStats?(): { symbolCount: number; fileCount: number };
  getImports?(filePath: string): string[];
  getDependents?(filePath: string, transitive?: boolean): string[];
}

/** File context status */
export type FileContextStatus = "active" | "stale";

/** Source of a file context record */
export type FileContextSource = "read_tool" | "write_tool" | "file_mentioned" | "external_edit";

/** File context entry */
export interface FileContextEntry {
  path: string;
  absolutePath: string;
  status: FileContextStatus;
  recordSource: FileContextSource;
  lastReadAt?: number;
  lastWriteAt?: number;
  lastExternalEditAt?: number;
}

/** Context-bound file tracking handle */
export interface FileContextHandle {
  markRead(path: string): void;
  markWrite(path: string): void;
  markMentioned(path: string): void;
  isStale(path: string): boolean;
  getEntry(path: string): FileContextEntry | undefined;
  listStale(): FileContextEntry[];
}

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

// ============================================================================
// Bash Executor Interface
// ============================================================================

export interface IBashExecutor {
  execute(command: string, options: BashExecuteOptions): Promise<BashExecuteResult>;
}

export interface BashExecuteOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum output size in bytes */
  maxOutputBytes?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface BashExecuteResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the command timed out */
  timedOut: boolean;
  /** Whether output was truncated */
  truncated: boolean;
  /** Execution duration in ms */
  durationMs: number;
}

/** Context passed to tool execution */
export interface ToolContext {
  /** Current user ID */
  userId?: string;
  /** Current session ID */
  sessionId?: string;
  /** Context ID for shared context views */
  contextId?: string;
  /** File context tracking handle (optional) */
  fileContext?: FileContextHandle;
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

export interface CoworkFolderGrantLike {
  rootPath: string;
  outputRoots?: string[];
}

export interface CoworkConnectorGrantLike {
  id: string;
  allowActions: boolean;
  scopes?: string[];
  provider?: string;
}

export interface CoworkSessionLike {
  grants: CoworkFolderGrantLike[];
  connectors: CoworkConnectorGrantLike[];
}

export const COWORK_POLICY_ACTIONS = [
  "file.read",
  "file.write",
  "file.*",
  "network.request",
  "connector.read",
  "connector.action",
] as const;

export type CoworkPolicyActionLike = (typeof COWORK_POLICY_ACTIONS)[number];

export const COWORK_POLICY_DECISIONS = ["allow", "allow_with_confirm", "deny"] as const;
export type CoworkPolicyDecisionType = (typeof COWORK_POLICY_DECISIONS)[number];

export const COWORK_RISK_TAGS = ["delete", "overwrite", "network", "connector", "batch"] as const;
export type CoworkRiskTag = (typeof COWORK_RISK_TAGS)[number];

const COWORK_POLICY_ACTION_SET = new Set<string>(COWORK_POLICY_ACTIONS);
const COWORK_POLICY_DECISION_SET = new Set<string>(COWORK_POLICY_DECISIONS);
const COWORK_RISK_TAG_SET = new Set<string>(COWORK_RISK_TAGS);

export function isCoworkPolicyAction(action: string): action is CoworkPolicyActionLike {
  return COWORK_POLICY_ACTION_SET.has(action);
}

export function isCoworkPolicyDecision(decision: string): decision is CoworkPolicyDecisionType {
  return COWORK_POLICY_DECISION_SET.has(decision);
}

export function isCoworkRiskTag(tag: string): tag is CoworkRiskTag {
  return COWORK_RISK_TAG_SET.has(tag);
}

export interface CoworkPolicyInputLike {
  action: CoworkPolicyActionLike;
  path?: string;
  grantRoots?: string[];
  outputRoots?: string[];
  fileSizeBytes?: number;
  host?: string;
  hostAllowlist?: string[];
  connectorScopeAllowed?: boolean;
  caseInsensitivePaths?: boolean;
}

export interface CoworkPolicyDecisionLike {
  decision: CoworkPolicyDecisionType;
  requiresConfirmation: boolean;
  reason: string;
  riskTags: CoworkRiskTag[];
  ruleId?: string;
}

export interface CoworkPolicyEngineLike {
  evaluate(input: CoworkPolicyInputLike): CoworkPolicyDecisionLike;
}

export interface CoworkPolicyConditions {
  pathWithinGrant?: boolean;
  pathWithinOutputRoot?: boolean;
  matchesPattern?: string[];
  fileSizeGreaterThan?: number;
  hostInAllowlist?: boolean;
  connectorScopeAllowed?: boolean;
}

export interface CoworkPolicyRule {
  id: string;
  action: CoworkPolicyActionLike;
  when?: CoworkPolicyConditions;
  decision: CoworkPolicyDecisionType;
  riskTags?: CoworkRiskTag[];
  reason?: string;
}

export interface CoworkPolicyConfig {
  version: "1.0";
  defaults: {
    fallback: CoworkPolicyDecisionType;
  };
  rules: CoworkPolicyRule[];
}

export interface CoworkToolContext {
  session: CoworkSessionLike;
  policyEngine: CoworkPolicyEngineLike;
  caseInsensitivePaths?: boolean;
}

// ============================================================================
// Cowork Policy Schema & Hashing
// ============================================================================

export type CoworkPolicyValidationError = {
  path: string;
  message: string;
};

export const COWORK_POLICY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "CoworkPolicyConfig",
  type: "object",
  additionalProperties: false,
  required: ["version", "defaults", "rules"],
  properties: {
    version: { const: "1.0" },
    defaults: {
      type: "object",
      additionalProperties: false,
      required: ["fallback"],
      properties: {
        fallback: { enum: COWORK_POLICY_DECISIONS },
      },
    },
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "action", "decision"],
        properties: {
          id: { type: "string", minLength: 1 },
          action: { enum: COWORK_POLICY_ACTIONS },
          when: {
            type: "object",
            additionalProperties: false,
            properties: {
              pathWithinGrant: { type: "boolean" },
              pathWithinOutputRoot: { type: "boolean" },
              matchesPattern: {
                type: "array",
                items: { type: "string" },
              },
              fileSizeGreaterThan: { type: "number" },
              hostInAllowlist: { type: "boolean" },
              connectorScopeAllowed: { type: "boolean" },
            },
          },
          decision: { enum: COWORK_POLICY_DECISIONS },
          riskTags: {
            type: "array",
            items: { enum: COWORK_RISK_TAGS },
          },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export function validateCoworkPolicyConfig(input: unknown): CoworkPolicyValidationError[] {
  const errors: CoworkPolicyValidationError[] = [];
  const addError = (path: string, message: string) => {
    errors.push({ path, message });
  };

  if (!isRecord(input)) {
    addError("", "Expected an object.");
    return errors;
  }

  validateKeys(input, ["version", "defaults", "rules"], "", addError);

  if (input.version !== "1.0") {
    addError("version", 'Expected "1.0".');
  }

  if (!isRecord(input.defaults)) {
    addError("defaults", "Expected an object.");
  } else {
    validateCoworkPolicyDefaults(input.defaults, addError);
  }

  if (!Array.isArray(input.rules)) {
    addError("rules", "Expected an array.");
  } else {
    input.rules.forEach((rule, index) => {
      const path = `rules[${index}]`;
      if (!isRecord(rule)) {
        addError(path, "Expected an object.");
        return;
      }
      validateCoworkPolicyRule(rule, path, addError);
    });
  }

  return errors;
}

function validateCoworkPolicyDefaults(
  defaults: Record<string, unknown>,
  addError: (path: string, message: string) => void
): void {
  validateKeys(defaults, ["fallback"], "defaults", addError);
  const fallback = defaults.fallback;
  if (typeof fallback !== "string" || !isCoworkPolicyDecision(fallback)) {
    addError("defaults.fallback", "Expected a valid policy decision.");
  }
}

function validateCoworkPolicyRule(
  rule: Record<string, unknown>,
  path: string,
  addError: (path: string, message: string) => void
): void {
  validateKeys(rule, ["id", "action", "when", "decision", "riskTags", "reason"], path, addError);

  if (typeof rule.id !== "string" || rule.id.trim().length === 0) {
    addError(`${path}.id`, "Expected a non-empty string.");
  }
  if (typeof rule.action !== "string" || !isCoworkPolicyAction(rule.action)) {
    addError(`${path}.action`, "Expected a valid policy action.");
  }
  if (typeof rule.decision !== "string" || !isCoworkPolicyDecision(rule.decision)) {
    addError(`${path}.decision`, "Expected a valid policy decision.");
  }
  if (rule.reason !== undefined && typeof rule.reason !== "string") {
    addError(`${path}.reason`, "Expected a string.");
  }
  validateCoworkPolicyRiskTags(rule.riskTags, `${path}.riskTags`, addError);
  validateCoworkPolicyConditions(rule.when, `${path}.when`, addError);
}

function validateCoworkPolicyRiskTags(
  value: unknown,
  path: string,
  addError: (path: string, message: string) => void
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    addError(path, "Expected an array.");
    return;
  }
  value.forEach((tag, index) => {
    if (typeof tag !== "string" || !isCoworkRiskTag(tag)) {
      addError(`${path}[${index}]`, "Expected a valid risk tag.");
    }
  });
}

function validateCoworkPolicyConditions(
  value: unknown,
  path: string,
  addError: (path: string, message: string) => void
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    addError(path, "Expected an object.");
    return;
  }

  validateKeys(
    value,
    [
      "pathWithinGrant",
      "pathWithinOutputRoot",
      "matchesPattern",
      "fileSizeGreaterThan",
      "hostInAllowlist",
      "connectorScopeAllowed",
    ],
    path,
    addError
  );

  validateOptionalBoolean(value.pathWithinGrant, `${path}.pathWithinGrant`, addError);
  validateOptionalBoolean(value.pathWithinOutputRoot, `${path}.pathWithinOutputRoot`, addError);
  validateOptionalStringArray(value.matchesPattern, `${path}.matchesPattern`, addError);
  validateOptionalNumber(value.fileSizeGreaterThan, `${path}.fileSizeGreaterThan`, addError);
  validateOptionalBoolean(value.hostInAllowlist, `${path}.hostInAllowlist`, addError);
  validateOptionalBoolean(value.connectorScopeAllowed, `${path}.connectorScopeAllowed`, addError);
}

function validateOptionalBoolean(
  value: unknown,
  path: string,
  addError: (path: string, message: string) => void
): void {
  if (value !== undefined && typeof value !== "boolean") {
    addError(path, "Expected a boolean.");
  }
}

function validateOptionalNumber(
  value: unknown,
  path: string,
  addError: (path: string, message: string) => void
): void {
  if (value !== undefined && typeof value !== "number") {
    addError(path, "Expected a number.");
  }
}

function validateOptionalStringArray(
  value: unknown,
  path: string,
  addError: (path: string, message: string) => void
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    addError(path, "Expected an array of strings.");
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      addError(`${path}[${index}]`, "Expected a string.");
    }
  });
}

export function parseCoworkPolicyConfig(input: unknown): CoworkPolicyConfig | null {
  return validateCoworkPolicyConfig(input).length === 0 ? (input as CoworkPolicyConfig) : null;
}

export function normalizeCoworkPolicyConfig(config: CoworkPolicyConfig): CoworkPolicyConfig {
  return JSON.parse(JSON.stringify(config)) as CoworkPolicyConfig;
}

export async function computeCoworkPolicyHash(config: CoworkPolicyConfig): Promise<string> {
  const serialized = stableStringify(normalizeCoworkPolicyConfig(config));
  return sha256(serialized);
}

function validateKeys(
  record: Record<string, unknown>,
  allowedKeys: string[],
  basePath: string,
  addError: (path: string, message: string) => void
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      const path = basePath ? `${basePath}.${key}` : key;
      addError(path, "Unexpected property.");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function simpleHash256(str: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const part = simpleHash(`${i}:${str}`).padStart(16, "0");
    parts.push(part);
  }
  return parts.join("");
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const cryptoImpl = globalThis.crypto;
  if (cryptoImpl?.subtle) {
    try {
      const hashBuffer = await cryptoImpl.subtle.digest("SHA-256", data);
      return bufferToHex(hashBuffer);
    } catch {
      // Fall back to deterministic non-crypto hash.
    }
  }

  return simpleHash256(text);
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

export interface A2AAdapterLike {
  request(
    from: string,
    to: string,
    payload: unknown,
    options?: { conversationId?: string; timeoutMs?: number; capabilities?: string[] }
  ): Promise<A2AEnvelopeLike>;
  resolveAgentForCapability(capability: string): string | undefined;
}

export interface A2AContext {
  adapter: A2AAdapterLike;
  agentId: string;
  routing?: A2ARoutingConfig;
  timeoutMs?: number;
}

// ============================================================================
// Runtime Message Bus Types
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

/** Runtime message bus interface */
export interface RuntimeMessageBus {
  send(from: string, to: string, payload: unknown): MessageEnvelope;
  request(from: string, to: string, payload: unknown, timeoutMs?: number): Promise<MessageEnvelope>;
  respond(from: string, correlationId: string, payload: unknown): MessageEnvelope;
  publish(from: string, topic: string, payload: unknown): MessageEnvelope;
  subscribe(topic: string, handler: MessageHandler): MessageSubscription;
  registerAgent(agentId: string, handler: MessageHandler): () => void;
  waitFor(correlationId: string, timeoutMs?: number): Promise<MessageEnvelope>;
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
  type: "none" | "process" | "docker" | "wasm" | "rust";
  /** Network access */
  networkAccess: "none" | "allowlist" | "full";
  /** Allowed hosts for network access */
  allowedHosts?: string[];
  /** Explicitly allowed filesystem roots */
  allowedRoots?: string[];
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
  /** Computer use permission */
  computer: "disabled" | "observe" | "control" | "full";
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
      computer: "disabled" as const,
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
      computer: "control" as const,
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
      computer: "full" as const,
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
      computer: "full" as const,
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

export function cloneSecurityPolicy(policy: SecurityPolicy): SecurityPolicy {
  return {
    sandbox: { ...policy.sandbox },
    permissions: { ...policy.permissions },
    limits: { ...policy.limits },
    aiPolicyEngine: policy.aiPolicyEngine,
    dataAccessPolicy: policy.dataAccessPolicy,
  };
}

export function getSecurityPreset(preset: SecurityPreset): SecurityPolicy {
  return cloneSecurityPolicy(SECURITY_PRESETS[preset]);
}

// ============================================================================
// Audit Types
// ============================================================================

/** Audit log entry */
export interface AuditEntry {
  entryId?: string;
  timestamp: number;
  toolName: string;
  action: "call" | "result" | "error" | "policy";
  sessionId?: string;
  taskId?: string;
  userId?: string;
  correlationId?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  durationMs?: number;
  sandboxed: boolean;
  policyDecision?: "allow" | "allow_with_confirm" | "deny";
  policyRuleId?: string;
  riskTags?: string[];
  riskScore?: number;
  reason?: string;
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
// Persistence Types (Track AU)
// ============================================================================

export type TaskRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface TaskRun {
  runId: string;
  goal: string;
  status: TaskRunStatus;
  startedAt: number;
  endedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolEvent {
  eventId: string;
  runId: string;
  toolId: string;
  inputHash: string;
  outputHash: string;
  durationMs: number;
  createdAt: number;
}

export interface ModelEvent {
  eventId: string;
  runId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
  createdAt: number;
}

export type WorkspaceEventKind =
  | "session_started"
  | "session_ended"
  | "approval_requested"
  | "approval_resolved";

export interface WorkspaceEvent {
  eventId: string;
  sessionId: string;
  kind: WorkspaceEventKind;
  payloadHash: string;
  createdAt: number;
}

export interface SecretRecord {
  key: string;
  encryptedPayload: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExportBundle {
  taskRuns: TaskRun[];
  toolEvents: ToolEvent[];
  modelEvents: ModelEvent[];
  workspaceEvents: WorkspaceEvent[];
}

export function normalizeAuditBundleForChecksum(bundle: ExportBundle): ExportBundle {
  return {
    taskRuns: [...bundle.taskRuns].sort((a, b) => a.runId.localeCompare(b.runId)),
    toolEvents: [...bundle.toolEvents].sort((a, b) => a.eventId.localeCompare(b.eventId)),
    modelEvents: [...bundle.modelEvents].sort((a, b) => a.eventId.localeCompare(b.eventId)),
    workspaceEvents: [...bundle.workspaceEvents].sort((a, b) => a.eventId.localeCompare(b.eventId)),
  };
}

export async function computeAuditBundleChecksum(bundle: ExportBundle): Promise<string> {
  const normalized = normalizeAuditBundleForChecksum(bundle);
  const serialized = stableStringify(normalized);
  return sha256(serialized);
}

export async function validateAuditBundleChecksum(
  bundle: ExportBundle,
  checksum: string
): Promise<boolean> {
  const computed = await computeAuditBundleChecksum(bundle);
  return computed === checksum;
}

export interface PersistenceConfig {
  dbPath: string;
  encryptionKeyRef?: string;
}

// ============================================================================
// Tool Gateway Types (Track AQ)
// ============================================================================

export type McpTransport = "stdio" | "http" | "websocket";

export interface McpManifest {
  serverId: string;
  name: string;
  version: string;
  description?: string;
  tools: MCPTool[];
}

export interface McpServerConfig {
  serverId: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  manifest?: McpManifest;
  sandbox?: SandboxConfig;
}

export interface ToolRegistryEntry {
  toolId: string;
  serverId: string;
  tool: MCPTool;
}

export interface CapabilityGrant {
  grantId?: string;
  capability: string;
  issuedAt?: number;
  expiresAt?: number;
  scope?: string;
  approvalId?: string;
}

export interface ToolInvocation {
  toolId: string;
  requestId: string;
  runId?: string;
  arguments: Record<string, unknown>;
  grantIds: string[];
  redactKeys?: string[];
  timeoutMs?: number;
}

export interface ToolAuditEvent {
  sequence: number;
  toolId: string;
  requestId: string;
  grantIds: string[];
  inputHash: string;
  outputHash: string;
  success: boolean;
  durationMs: number;
  createdAt: number;
}

export interface ToolGatewaySnapshot {
  tools: ToolRegistryEntry[];
  grants: CapabilityGrant[];
  auditCursor: number;
}

// ============================================================================
// Model Fabric Types (Track AS)
// ============================================================================

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  tools?: Tool[];
  topP?: number;
  timeoutMs?: number;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error";

export interface CompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: FinishReason;
  model: string;
  latencyMs: number;
}

export type StreamChunkType = "content" | "tool_call" | "usage" | "done" | "error";

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
  error?: string;
  finishReason?: FinishReason;
}

export type ProviderKind = "openai" | "anthropic" | "gemini" | "local";

export interface ProviderConfigRecord {
  providerId: string;
  kind: ProviderKind;
  authRef: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  organizationId?: string;
  modelIds: string[];
  defaultModelId?: string;
}

export interface RouteRule {
  ruleId: string;
  priority: number;
  workerId?: string;
  taskType?: string;
  modelId: string;
  fallbackModelIds?: string[];
}

export interface ModelUsageEvent {
  eventId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd?: number;
  createdAt: number;
}

export interface ModelFabricSnapshot {
  providers: ProviderConfigRecord[];
  routes: RouteRule[];
  usageCursor: number;
}

export interface ModelFabricContext {
  workerId?: string;
  taskType?: string;
}

export interface ModelStreamHandle {
  next(): Promise<StreamChunk | null>;
}

// ============================================================================
// Workspace Session Types (Track AR)
// ============================================================================

export type WorkspaceSessionKind = "terminal" | "browser" | "file";

export type WorkspaceSessionStatus = "created" | "active" | "paused" | "closed";

export type WorkspaceSessionEventType =
  | "stdout"
  | "stderr"
  | "prompt"
  | "screenshot"
  | "dom_snapshot"
  | "file_view"
  | "log_line"
  | "status";

export type WorkspaceApprovalKind = "tool" | "plan" | "escalation";

export type WorkspaceApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface WorkspaceSessionConfig {
  sessionId?: string;
  kind: WorkspaceSessionKind;
  ownerAgentId?: string;
}

export interface WorkspaceSession {
  sessionId: string;
  kind: WorkspaceSessionKind;
  status: WorkspaceSessionStatus;
  ownerAgentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSessionEvent {
  sequence: number;
  sessionId: string;
  type: WorkspaceSessionEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface WorkspaceSessionSnapshot {
  sessions: WorkspaceSession[];
  eventCursor: number;
}

export interface WorkspaceApprovalRequestInput {
  requestId?: string;
  kind: WorkspaceApprovalKind;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}

export interface WorkspaceApprovalRequest {
  requestId: string;
  kind: WorkspaceApprovalKind;
  payload: Record<string, unknown>;
  requestedAt: number;
  timeoutMs?: number;
}

export interface WorkspaceApprovalDecisionInput {
  requestId: string;
  status?: WorkspaceApprovalStatus;
  approved?: boolean;
  reason?: string;
}

export interface WorkspaceApprovalDecision {
  requestId: string;
  status: WorkspaceApprovalStatus;
  approved: boolean;
  reason?: string;
}

export interface TaskRunFilter {
  runId?: string;
  status?: TaskRunStatus | TaskRunStatus[];
  startedAfter?: number;
  startedBefore?: number;
  limit?: number;
}

export interface ExportFilter {
  runId?: string;
  sessionId?: string;
  since?: number;
  until?: number;
  limit?: number;
}

// ============================================================================
// Agent Orchestrator Types
// ============================================================================

/** Tool execution policy mode */
export type ExecutionPolicy = "interactive" | "batch";

/** Tool registry scoping for isolated registry views. */
export interface ToolRegistryScope {
  /** Tool allowlist patterns for registry access. */
  allowedTools: string[];
}

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

// ============================================================================
// Tool Output Spooling
// ============================================================================

export interface ToolOutputSpoolPolicy {
  /** Max bytes to return in LLM-visible output */
  maxBytes: number;
  /** Max lines to return in LLM-visible output */
  maxLines: number;
}

export interface ToolOutputSpoolMetadata {
  spoolId: string;
  toolName: string;
  toolCallId: string;
  createdAt: number;
  /** File path or URI for the spooled output */
  uri: string;
  /** Total bytes in the original output */
  byteSize: number;
  /** Total lines in the original output */
  lineCount: number;
  /** Bytes removed from the LLM-visible output */
  truncatedBytes: number;
  /** Lines removed from the LLM-visible output */
  truncatedLines: number;
  /** Policy used for truncation */
  policy: ToolOutputSpoolPolicy;
  /** Deterministic hash of the full output content */
  contentHash: string;
  /** Whether the spool write succeeded */
  stored: boolean;
  /** Error message when spool write fails */
  error?: string;
}

export interface ToolOutputSpoolRecord {
  version: 1;
  metadata: ToolOutputSpoolMetadata;
  content: ToolContent[];
}

export interface ToolOutputSpoolRequest {
  toolName: string;
  toolCallId: string;
  content: ToolContent[];
  policy?: ToolOutputSpoolPolicy;
  context?: ToolContext;
}

export interface ToolOutputSpoolResult {
  spooled: boolean;
  truncated: boolean;
  output: ToolContent[];
  metadata?: ToolOutputSpoolMetadata;
}

export interface ToolOutputSpooler {
  spool(request: ToolOutputSpoolRequest): Promise<ToolOutputSpoolResult>;
}

export const DEFAULT_TOOL_OUTPUT_SPOOL_POLICY: ToolOutputSpoolPolicy = {
  maxBytes: 64 * 1024,
  maxLines: 200,
};

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
  execution?: ExecutionConfig;
  vision?: VisionConfig;
}

// ============================================================================
// Execution Plane Types
// ============================================================================

export type ExecutionQueueClass = "interactive" | "normal" | "batch";

export type ExecutionTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected";

export type ExecutionLeaseStatus = "running" | "completed" | "failed" | "canceled";

export interface ExecutionLease {
  leaseId: string;
  taskId: string;
  workerId: string;
  status: ExecutionLeaseStatus;
  acquiredAt: number;
  expiresAt: number;
  lastHeartbeatAt: number;
  attempt: number;
}

export type ExecutionWorkerState = "idle" | "busy" | "draining";

export interface WorkerStatus {
  workerId: string;
  state: ExecutionWorkerState;
  capacity: number;
  inFlight: number;
  lastSeenAt: number;
}

export interface ExecutionQuotaLimit {
  maxInFlight: number;
}

export interface ExecutionQuotaConfig {
  models?: Record<string, ExecutionQuotaLimit>;
  tools?: Record<string, ExecutionQuotaLimit>;
  defaultModel?: ExecutionQuotaLimit;
  defaultTool?: ExecutionQuotaLimit;
}

export interface ExecutionConfig {
  leaseTtlMs: number;
  heartbeatIntervalMs: number;
  schedulerTickMs: number;
  maxInFlightPerWorker: number;
  queueDepthLimit: number;
  batchBackpressureThreshold: number;
  quotaConfig?: ExecutionQuotaConfig;
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  leaseTtlMs: 30_000,
  heartbeatIntervalMs: 5_000,
  schedulerTickMs: 100,
  maxInFlightPerWorker: 4,
  queueDepthLimit: 1000,
  batchBackpressureThreshold: 500,
};

// ============================================================================
// Vision Types
// ============================================================================

export interface VisionConfig {
  /** Whether OCR blocks are processed in layout scans */
  ocrEnabled: boolean;
  /** Confidence threshold for auto-applying region mappings */
  autoApplyConfidenceThreshold: number;
  /** Maximum nodes for layout graphs */
  maxNodes: number;
  /** Max screenshot width for processing */
  maxScreenshotWidth: number;
  /** Max screenshot height for processing */
  maxScreenshotHeight: number;
}

export const DEFAULT_VISION_CONFIG: VisionConfig = {
  ocrEnabled: true,
  autoApplyConfidenceThreshold: 0.85,
  maxNodes: 1000,
  maxScreenshotWidth: 1920,
  maxScreenshotHeight: 1080,
};

export interface ExecutionTaskSnapshot {
  taskId: string;
  type: string;
  queueClass: ExecutionQueueClass;
  status: ExecutionTaskStatus;
  attempt: number;
  sequence: number;
  timestamp: number;
  payload: unknown;
  workerId?: string;
  result?: unknown;
  error?: string;
  modelId?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionLeaseFilter {
  status?: ExecutionLeaseStatus | ExecutionLeaseStatus[];
  taskId?: string;
  workerId?: string;
}

export interface ExecutionTaskSnapshotFilter {
  status?: ExecutionTaskStatus | ExecutionTaskStatus[];
  taskId?: string;
  afterSequence?: number;
  limit?: number;
}

export interface ExecutionStateStore {
  saveLease(lease: ExecutionLease): Promise<void>;
  loadLease(leaseId: string): Promise<ExecutionLease | null>;
  listLeases(filter?: ExecutionLeaseFilter): Promise<ExecutionLease[]>;
  deleteLease(leaseId: string): Promise<void>;
  saveTaskSnapshot(snapshot: ExecutionTaskSnapshot): Promise<void>;
  listTaskSnapshots(filter?: ExecutionTaskSnapshotFilter): Promise<ExecutionTaskSnapshot[]>;
  getLatestTaskSnapshots(): Promise<ExecutionTaskSnapshot[]>;
}

// ============================================================================
// Workforce Orchestrator Types
// ============================================================================

export type WorkforceTaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export type WorkforceTaskBlockedReason = "dependencies" | "backoff" | "escalated";

export interface WorkforceFailurePolicy {
  retryCount: number;
  backoffMs: number;
  escalateAfter: number;
}

export interface WorkforceRuntimeConfig {
  runId?: string;
  eventVersion?: number;
  failurePolicy?: WorkforceFailurePolicy;
}

export interface WorkforceTaskInput {
  taskId: string;
  title: string;
  requiredCapabilities?: string[];
  dependsOn?: string[];
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface WorkforcePlanInput {
  planId: string;
  goal?: string;
  tasks: WorkforceTaskInput[];
}

export interface WorkforceTaskNode {
  taskId: string;
  title: string;
  status: WorkforceTaskStatus;
  dependsOn: string[];
  requiredCapabilities: string[];
  attempt: number;
  priority: number;
  assignedWorkerId?: string;
  blockedUntil?: number;
  blockedReason?: WorkforceTaskBlockedReason;
  metadata?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export type WorkforceWorkerState = "idle" | "busy" | "draining";

export interface WorkforceWorkerRegistration {
  workerId: string;
  capabilities: string[];
  capacity: number;
  state?: WorkforceWorkerState;
}

export interface WorkforceWorkerProfile {
  workerId: string;
  capabilities: string[];
  capacity: number;
  activeCount: number;
  state: WorkforceWorkerState;
}

export interface WorkforceAssignment {
  taskId: string;
  workerId: string;
}

export type WorkforceResultStatus = "completed" | "failed" | "canceled";

export interface WorkforceResultEnvelope {
  taskId: string;
  workerId: string;
  status: WorkforceResultStatus;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type WorkforceEventType =
  | "plan_created"
  | "task_queued"
  | "task_assigned"
  | "task_started"
  | "task_blocked"
  | "task_completed"
  | "task_failed"
  | "task_canceled"
  | "task_retry_scheduled"
  | "task_escalated"
  | "task_dead_lettered"
  | "worker_registered"
  | "result_published"
  | "scheduler_tick";

export interface WorkforceEvent {
  sequence: number;
  eventVersion: number;
  runId: string;
  type: WorkforceEventType;
  taskId?: string;
  workerId?: string;
  logicalTime?: number;
  payload?: Record<string, unknown>;
}

export type WorkforceChannelMessageType = "task" | "result";

export interface WorkforceChannelMessage {
  sequence: number;
  type: WorkforceChannelMessageType;
  taskId: string;
  payload: unknown;
}

export interface WorkforceSnapshot {
  runId: string;
  planId?: string;
  goal?: string;
  tasks: WorkforceTaskNode[];
  workers: WorkforceWorkerProfile[];
  eventCursor: number;
  channelCursor: number;
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
    /** Persist plans to disk (default handled by planning engine) */
    persistToFile?: boolean;
    /** Working directory for plan persistence */
    workingDirectory?: string;
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
  reasonCode?: string;
  riskTags?: string[];
  taskNodeId?: string;
  escalation?: PermissionEscalation;
}

/** Confirmation handler callback */
export type ConfirmationHandler = (request: ConfirmationRequest) => Promise<boolean>;

// ============================================================================
// Clarification Types
// ============================================================================

export type ClarificationPriority = "low" | "medium" | "high" | "blocking";

export interface ClarificationContext {
  taskId?: string;
  sessionId?: string;
  relatedFiles?: string[];
  codeSnippet?: string;
}

export interface ClarificationRequest {
  id: string;
  question: string;
  context?: ClarificationContext;
  options?: string[];
  timeoutMs?: number;
  continueWorkWhileWaiting?: boolean;
  priority?: ClarificationPriority;
}

export interface ClarificationResponse {
  requestId: string;
  answer: string;
  selectedOption?: number;
  timestamp: number;
  responseTime: number;
}

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
  reasonCode?: string;
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
// Checkpoint Types
// ============================================================================

/** Checkpoint status */
export type CheckpointStatus = "pending" | "completed" | "failed" | "cancelled";

/** Checkpoint error information */
export interface CheckpointError {
  message: string;
  code?: string;
  recoverable: boolean;
}

/** Serializable message */
export interface CheckpointMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/** Pending tool call */
export interface CheckpointToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

/** Completed tool result */
export interface CheckpointToolResult {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

/** Serializable checkpoint data */
export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Version for migration support */
  version: number;
  /** Timestamp when checkpoint was created */
  createdAt: number;
  /** Original task/goal */
  task: string;
  /** Agent type */
  agentType: string;
  /** Agent instance ID */
  agentId: string;
  /** Current status */
  status: CheckpointStatus;
  /** Conversation history (messages) */
  messages: CheckpointMessage[];
  /** Pending tool calls */
  pendingToolCalls: CheckpointToolCall[];
  /** Completed tool calls with results */
  completedToolCalls: CheckpointToolResult[];
  /** Current step/turn number */
  currentStep: number;
  /** Maximum allowed steps */
  maxSteps: number;
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Error information if failed */
  error?: CheckpointError;
  /** Parent checkpoint ID (for nested agents) */
  parentCheckpointId?: string;
  /** Child checkpoint IDs */
  childCheckpointIds: string[];
}

/** Checkpoint filter options */
export interface CheckpointFilter {
  /** Filter by status */
  status?: CheckpointStatus | CheckpointStatus[];
  /** Filter by agent type */
  agentType?: string;
  /** Filter by creation time (after) */
  createdAfter?: number;
  /** Filter by creation time (before) */
  createdBefore?: number;
  /** Maximum results */
  limit?: number;
  /** Sort order */
  sortBy?: "createdAt" | "status";
  sortOrder?: "asc" | "desc";
}

/** Checkpoint summary (for listing) */
export interface CheckpointSummary {
  id: string;
  task: string;
  agentType: string;
  status: CheckpointStatus;
  createdAt: number;
  currentStep: number;
  maxSteps: number;
  hasError: boolean;
}

/** Checkpoint storage interface */
export interface ICheckpointStorage {
  /** Save a checkpoint */
  save(checkpoint: Checkpoint): Promise<void>;
  /** Load a checkpoint by ID */
  load(id: string): Promise<Checkpoint | null>;
  /** List checkpoints with optional filters */
  list(filter?: CheckpointFilter): Promise<CheckpointSummary[]>;
  /** Delete a checkpoint */
  delete(id: string): Promise<boolean>;
  /** Delete old checkpoints */
  prune(olderThanMs: number): Promise<number>;
}

/** Checkpoint manager configuration */
export interface CheckpointManagerConfig {
  /** Checkpoint storage implementation */
  storage: ICheckpointStorage;
  /** Auto-checkpoint interval (steps) */
  autoCheckpointInterval?: number;
  /** Maximum checkpoints to keep per agent */
  maxCheckpointsPerAgent?: number;
  /** Auto-prune checkpoints older than (ms) */
  autoPruneOlderThanMs?: number;
}

/** Checkpoint create params */
export interface CheckpointCreateParams {
  task: string;
  agentType: string;
  agentId: string;
  maxSteps?: number;
  metadata?: Record<string, unknown>;
  parentCheckpointId?: string;
}

/** Checkpoint status update payload */
export interface CheckpointStatusUpdate {
  message: string;
  code?: string;
  recoverable?: boolean;
}

/** Recovery options */
export interface RecoveryOptions {
  /** Skip completed tool calls */
  skipCompletedTools?: boolean;
  /** Retry failed tool calls */
  retryFailedTools?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Resume from specific step */
  fromStep?: number;
}

/** Recovery result */
export interface RecoveryResult {
  /** Whether recovery succeeded */
  success: boolean;
  /** Recovered checkpoint */
  checkpoint: Checkpoint;
  /** Steps skipped */
  skippedSteps: number;
  /** Steps to replay */
  stepsToReplay: number;
  /** Error if recovery failed */
  error?: string;
}

/** Checkpoint manager interface */
export interface ICheckpointManager {
  create(params: CheckpointCreateParams): Promise<Checkpoint>;
  addMessage(checkpointId: string, message: Omit<CheckpointMessage, "timestamp">): Promise<void>;
  addPendingToolCall(
    checkpointId: string,
    toolCall: Omit<CheckpointToolCall, "timestamp">
  ): Promise<void>;
  completeToolCall(
    checkpointId: string,
    result: Omit<CheckpointToolResult, "timestamp">
  ): Promise<void>;
  advanceStep(checkpointId: string): Promise<number>;
  updateStatus(
    checkpointId: string,
    status: CheckpointStatus,
    error?: CheckpointStatusUpdate
  ): Promise<void>;
  updateMetadata(checkpointId: string, metadata: Record<string, unknown>): Promise<void>;
  save(checkpointId: string): Promise<void>;
  saveAll(): Promise<void>;
  load(checkpointId: string): Promise<Checkpoint | null>;
  prepareRecovery(checkpointId: string, options?: RecoveryOptions): Promise<RecoveryResult>;
  getRecoverableCheckpoints(): Promise<CheckpointSummary[]>;
  list(filter?: CheckpointFilter): Promise<CheckpointSummary[]>;
  getPendingCheckpoints(): Promise<CheckpointSummary[]>;
  delete(checkpointId: string): Promise<boolean>;
  prune(): Promise<number>;
  dispose(): Promise<void>;
}

/** Checkpoint event payload */
export interface CheckpointEvent {
  checkpointId: string;
  runId?: string;
  agentId: string;
  agentType: string;
  status: CheckpointStatus;
  step: number;
  update: "created" | "message" | "tool_call" | "tool_result" | "turn_end" | "status";
  messageRole?: CheckpointMessage["role"];
  toolCallId?: string;
  toolName?: string;
  success?: boolean;
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
  | "ReviewReport"
  | "ImageArtifact"
  | "LayoutGraph"
  | "VisualDiffReport";

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

// ============================================================================
// Tool Execution Interfaces
// ============================================================================

export interface ToolExecutor {
  execute(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult>;
}

// ============================================================================
// Tool Policy Interfaces
// ============================================================================

export interface ToolPolicyContext {
  call: MCPToolCall;
  tool: string;
  operation: string;
  resource?: string;
  toolDefinition?: MCPTool;
  toolServer?: string;
  context: ToolContext;
  taskNodeId?: string;
}

export interface ToolPolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  reasonCode?: string;
  riskTags?: string[];
  escalation?: PermissionEscalation;
  policyDecision?: "allow" | "allow_with_confirm" | "deny";
  policyRuleId?: string;
  policyAction?: CoworkPolicyActionLike;
}

export interface ToolPolicyEngine {
  evaluate(context: ToolPolicyContext): ToolPolicyDecision;
}

export type ToolSafetyDecision = "allow" | "deny" | "ask_user";

export interface ToolSafetyCheckResult {
  decision: ToolSafetyDecision;
  reason?: string;
  reasonCode?: string;
  riskTags?: string[];
}

export type ToolSafetyChecker = (
  context: ToolPolicyContext
) => ToolSafetyCheckResult | null | undefined;

export interface ToolExecutionContext {
  /** Optional safety checkers that can deny or request confirmation. */
  safetyCheckers?: ToolSafetyChecker[];
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Available agent types.
 * Each type has specialized tools and behaviors.
 */
export type AgentType =
  | "general"
  | "bash"
  | "explore"
  | "plan"
  | "code"
  | "research"
  | "test-writer"
  | "code-reviewer"
  | "implementer"
  | "debugger"
  | "digest"
  | "verifier";

/**
 * Agent profile containing configuration for a specific agent type.
 */
export interface AgentProfile {
  /** Agent type identifier */
  type: AgentType;

  /** Human-readable name */
  name: string;

  /** Description of agent capabilities */
  description: string;

  /** Tools this agent has access to */
  allowedTools: string[];

  /** System prompt for the agent */
  systemPrompt: string;

  /** Security preset to use */
  securityPreset: "safe" | "balanced" | "power" | "developer";

  /** Maximum turns before auto-stop */
  maxTurns: number;

  /** Whether confirmation is required for dangerous operations */
  requireConfirmation: boolean;

  /**
   * Edit restrictions for file operations.
   * Used to constrain agents like "plan" to only write to specific paths.
   * Pattern matching uses glob syntax.
   */
  editRestrictions?: EditRestrictions;
}

/**
 * Edit restrictions for constraining file write operations.
 */
export interface EditRestrictions {
  /** Glob patterns for allowed write paths. */
  allow?: string[];
  /** Glob patterns for denied write paths. */
  deny?: string[];
}

/**
 * Options for spawning a specialized agent.
 */
export interface SpawnAgentOptions {
  /** Agent type to spawn */
  type: AgentType;
  /** Optional agent ID override (internal use). */
  agentId?: string;
  /** Task description for the agent */
  task: string;
  /** Override default max turns */
  maxTurns?: number;
  /** Run in background (non-blocking) */
  runInBackground?: boolean;
  /** Parent context for tracing */
  parentTraceId?: string;
  /** Explicit context ID for this agent */
  contextId?: string;
  /** Parent context ID for live context views */
  parentContextId?: string;
  /** Custom security policy override */
  security?: SecurityPolicy;
  /** Optional tool allowlist override for scoped execution */
  allowedTools?: string[];
  /** Current recursion depth (internal use). */
  _depth?: number;
  /** Abort signal for cancellation support. */
  signal?: AbortSignal;
}

/**
 * Result from a spawned agent.
 */
export interface AgentResult {
  /** Agent ID for reference */
  agentId: string;
  /** Agent type that was spawned */
  type: AgentType;
  /** Whether the agent completed successfully */
  success: boolean;
  /** Final output/response from the agent */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Number of turns executed */
  turns: number;
  /** Execution time in milliseconds */
  durationMs: number;
}

export type AgentLifecycleStatus = "idle" | "running" | "completed" | "failed" | "stopped";

/**
 * Interface for agent spawning and management.
 */
export interface IAgentManager {
  /** Spawn a specialized agent */
  spawn(options: SpawnAgentOptions): Promise<AgentResult>;
  /** Spawn multiple agents in parallel */
  spawnParallel(options: SpawnAgentOptions[]): Promise<AgentResult[]>;
  /** Get available agent types */
  getAvailableTypes(): AgentType[];
  /** Get profile for an agent type */
  getProfile(type: AgentType): AgentProfile;
  /** Stop a running agent by ID */
  stop(agentId: string): Promise<void>;
  /** Get status of a running agent */
  getStatus(agentId: string): AgentLifecycleStatus | undefined;
}

// ============================================================================
// Planning Types
// ============================================================================

/**
 * Execution plan created by agent before taking action.
 */
export interface ExecutionPlan {
  /** Plan identifier */
  id: string;
  /** High-level goal */
  goal: string;
  /** Ordered execution steps */
  steps: PlanStep[];
  /** Estimated duration in milliseconds */
  estimatedDuration: number;
  /** Risk assessment */
  riskAssessment: "low" | "medium" | "high";
  /** Tools required for execution */
  toolsNeeded: string[];
  /** Context/files needed */
  contextRequired: string[];
  /** Success criteria */
  successCriteria: string[];
  /** Created timestamp */
  createdAt: number;
  /** Status */
  status: "draft" | "approved" | "rejected" | "executed";
  /** Approval required */
  requiresApproval: boolean;
}

/**
 * Individual step in execution plan.
 */
export interface PlanStep {
  /** Step identifier */
  id: string;
  /** Step number in sequence */
  order: number;
  /** Human-readable description */
  description: string;
  /** Tools to be used */
  tools: string[];
  /** Expected outcome */
  expectedOutcome: string;
  /** Dependencies on other steps (by ID) */
  dependencies: string[];
  /** Estimated duration in ms */
  estimatedDuration?: number;
  /** Whether this step can run in parallel */
  parallelizable: boolean;
  /** Execution status */
  status?: "pending" | "executing" | "complete" | "failed" | "skipped";
  /** Actual tool calls made (populated during execution) */
  toolCalls?: MCPToolCall[];
}

// ============================================================================
// Runtime Paths
// ============================================================================

export const DEFAULT_AGENT_RUNTIME_DIR = ".agent-runtime";
export const DEFAULT_AGENT_PLANS_DIR = `${DEFAULT_AGENT_RUNTIME_DIR}/plans`;
export const DEFAULT_AGENT_TODO_PATH = `${DEFAULT_AGENT_RUNTIME_DIR}/TODO.md`;
export const DEFAULT_AGENT_TASK_PATH = `${DEFAULT_AGENT_RUNTIME_DIR}/TASKS.json`;
export const DEFAULT_AGENT_SCRATCH_DIR = `${DEFAULT_AGENT_RUNTIME_DIR}/scratch`;
export const DEFAULT_AGENT_KNOWLEDGE_DIR = `${DEFAULT_AGENT_RUNTIME_DIR}/knowledge`;
export const DEFAULT_AGENT_SPOOL_DIR = `${DEFAULT_AGENT_RUNTIME_DIR}/spool`;
