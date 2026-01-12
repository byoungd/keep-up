/**
 * Plugin System Types
 *
 * Defines the interfaces and types for the plugin architecture.
 * Enables users to create custom tools, agents, and extensions.
 */

// ============================================================================
// Plugin Manifest
// ============================================================================

/**
 * Plugin manifest schema.
 * Declarative configuration for plugins.
 */
export interface PluginManifest {
  /** Unique plugin identifier (reverse-domain style recommended) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin version (semver) */
  version: string;

  /** Short description */
  description: string;

  /** Plugin author */
  author?: string;

  /** License identifier */
  license?: string;

  /** Homepage or documentation URL */
  homepage?: string;

  /** Repository URL */
  repository?: string;

  /** Minimum runtime version required */
  minRuntimeVersion?: string;

  /** Plugin type */
  type: PluginType;

  /** Entry point (main module path) */
  main: string;

  /** Required capabilities/permissions */
  capabilities: PluginCapability[];

  /** Dependencies on other plugins */
  dependencies?: PluginDependency[];

  /** Configuration schema for user settings */
  configSchema?: Record<string, unknown>;

  /** Default configuration values */
  defaultConfig?: Record<string, unknown>;

  /** Contributes (tools, agents, commands, etc.) */
  contributes?: PluginContributes;

  /** Activation events (when to load the plugin) */
  activationEvents?: ActivationEvent[];

  /** Keywords for discovery */
  keywords?: string[];
}

export type PluginType =
  | "tool" // Provides tools for agents
  | "agent" // Provides specialized agents
  | "provider" // Provides LLM or search providers
  | "extension" // General extension
  | "theme"; // UI customization (future)

export type PluginCapability =
  | "network" // Can make network requests
  | "filesystem" // Can access file system
  | "process" // Can spawn processes
  | "clipboard" // Can access clipboard
  | "notifications" // Can show notifications
  | "secrets" // Can store/retrieve secrets
  | "tools:register" // Can register new tools
  | "agents:register" // Can register new agents
  | "hooks:subscribe" // Can subscribe to hooks
  | "config:read" // Can read config
  | "config:write"; // Can write config

export interface PluginDependency {
  /** Plugin ID */
  id: string;
  /** Version range (semver) */
  version: string;
  /** Whether dependency is optional */
  optional?: boolean;
}

export interface PluginContributes {
  /** Tool definitions */
  tools?: ToolContribution[];
  /** Agent definitions */
  agents?: AgentContribution[];
  /** Commands that can be invoked */
  commands?: CommandContribution[];
  /** Configuration properties */
  configuration?: ConfigurationContribution[];
}

export interface ToolContribution {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Handler function name in main module */
  handler: string;
}

export interface AgentContribution {
  /** Agent type identifier */
  type: string;
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Handler class/function name */
  handler: string;
}

export interface CommandContribution {
  /** Command ID */
  id: string;
  /** Command title */
  title: string;
  /** Handler function name */
  handler: string;
}

export interface ConfigurationContribution {
  /** Configuration key */
  key: string;
  /** Type */
  type: "string" | "number" | "boolean" | "array" | "object";
  /** Default value */
  default?: unknown;
  /** Description */
  description?: string;
}

export type ActivationEvent =
  | "*" // Always active
  | "onStartup" // Activate on startup
  | `onTool:${string}` // Activate when tool is called
  | `onAgent:${string}` // Activate when agent type is spawned
  | `onCommand:${string}` // Activate when command is invoked
  | `onConfig:${string}`; // Activate when config changes

// ============================================================================
// Plugin Interface
// ============================================================================

/**
 * Plugin interface that all plugins must implement.
 */
export interface IPlugin {
  /** Plugin manifest */
  readonly manifest: PluginManifest;

  /**
   * Activate the plugin.
   * Called when the plugin is loaded.
   */
  activate(context: PluginContext): Promise<void>;

  /**
   * Deactivate the plugin.
   * Called when the plugin is unloaded.
   */
  deactivate?(): Promise<void>;
}

/**
 * Context provided to plugins during activation.
 */
export interface PluginContext {
  /** Plugin's storage directory */
  storagePath: string;

  /** Global storage directory (shared across workspaces) */
  globalStoragePath: string;

  /** Plugin's log function */
  log: PluginLogger;

  /** Subscribe to events */
  subscriptions: Disposable[];

  /** Get plugin configuration */
  getConfig<T>(key: string): T | undefined;

  /** Set plugin configuration */
  setConfig<T>(key: string, value: T): Promise<void>;

  /** Get secret value */
  getSecret(key: string): Promise<string | undefined>;

  /** Store secret value */
  setSecret(key: string, value: string): Promise<void>;

  /** Register a tool */
  registerTool(contribution: ToolContribution, handler: ToolHandler): Disposable;

  /** Register an agent type */
  registerAgent(contribution: AgentContribution, factory: AgentFactory): Disposable;

  /** Register a command */
  registerCommand(id: string, handler: CommandHandler): Disposable;

  /** Subscribe to a hook */
  subscribeHook<T>(hook: HookType, handler: HookHandler<T>): Disposable;

  /** Emit an event */
  emit(event: string, data: unknown): void;

  /** Show notification to user */
  showNotification(message: string, type?: "info" | "warning" | "error"): void;

  /** Show progress */
  withProgress<T>(title: string, task: (progress: Progress) => Promise<T>): Promise<T>;
}

export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface Disposable {
  dispose(): void;
}

export interface Progress {
  report(value: { message?: string; increment?: number }): void;
}

// ============================================================================
// Plugin Handlers
// ============================================================================

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolResult>;

export interface ToolExecutionContext {
  /** Current working directory */
  workingDirectory?: string;
  /** Document ID if in document context */
  documentId?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Plugin logger */
  log: PluginLogger;
}

export interface ToolResult {
  success: boolean;
  content: string | { type: string; data: unknown };
  error?: { code: string; message: string };
}

export type AgentFactory = (config: AgentFactoryConfig) => IPluginAgent;

export interface AgentFactoryConfig {
  /** Task to perform */
  task: string;
  /** Agent configuration */
  config: Record<string, unknown>;
  /** Plugin context */
  context: PluginContext;
}

export interface IPluginAgent {
  /** Run the agent */
  run(): Promise<AgentRunResult>;
  /** Stop the agent */
  stop(): void;
}

export interface AgentRunResult {
  success: boolean;
  output: string;
  error?: string;
}

export type CommandHandler = (args?: Record<string, unknown>) => Promise<void>;

// ============================================================================
// Hook System
// ============================================================================

export type HookType =
  // Lifecycle hooks
  | "beforeToolCall"
  | "afterToolCall"
  | "beforeAgentRun"
  | "afterAgentRun"
  | "beforeLLMCall"
  | "afterLLMCall"
  // Event hooks
  | "onError"
  | "onProgress"
  | "onUserInput"
  | "onConfigChange";

export type HookHandler<T = unknown> = (data: T) => Promise<T | undefined>;

export interface BeforeToolCallHookData {
  toolName: string;
  arguments: Record<string, unknown>;
  context: ToolExecutionContext;
}

export interface AfterToolCallHookData {
  toolName: string;
  arguments: Record<string, unknown>;
  result: ToolResult;
  durationMs: number;
}

export interface BeforeAgentRunHookData {
  agentType: string;
  task: string;
  config: Record<string, unknown>;
}

export interface AfterAgentRunHookData {
  agentType: string;
  task: string;
  result: AgentRunResult;
  durationMs: number;
}

export interface BeforeLLMCallHookData {
  messages: unknown[];
  tools: unknown[];
  model?: string;
}

export interface AfterLLMCallHookData {
  messages: unknown[];
  response: unknown;
  tokensUsed?: { input: number; output: number };
  durationMs: number;
}

// ============================================================================
// Plugin State
// ============================================================================

export type PluginState = "unloaded" | "loading" | "active" | "deactivating" | "error";

export interface PluginInfo {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Current state */
  state: PluginState;
  /** Error if in error state */
  error?: string;
  /** When the plugin was loaded */
  loadedAt?: number;
  /** When the plugin was activated */
  activatedAt?: number;
}
