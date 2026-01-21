/**
 * External Adapter Interface
 *
 * Provides extension points for integrating external agent frameworks
 * like LangChain, Dify, CrewAI, etc. without coupling to them directly.
 *
 * Design Philosophy:
 * - Keep core runtime lean and independent
 * - Allow optional integration via adapters
 * - Use MCP as the universal tool protocol bridge
 */

import {
  COWORK_POLICY_ACTIONS,
  type MCPTool,
  type MCPToolCall,
  type MCPToolResult,
  type MCPToolServer,
  type ToolContext,
} from "@ku0/agent-runtime-core";

// ============================================================================
// External Framework Adapter Interface
// ============================================================================

/**
 * Adapter interface for external agent frameworks.
 * Implement this to bridge external frameworks into the MCP ecosystem.
 */
export interface IExternalFrameworkAdapter {
  /** Framework name (e.g., 'langchain', 'dify', 'crewai') */
  readonly name: string;

  /** Check if the framework is available/configured */
  isAvailable(): Promise<boolean>;

  /** Convert external tools to MCP format */
  importTools(): Promise<MCPTool[]>;

  /** Execute an external tool via the framework */
  executeTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;

  /** Optional: Run an entire workflow/chain */
  runWorkflow?(workflowId: string, input: unknown): Promise<unknown>;
}

// ============================================================================
// LangChain Adapter Stub (for future implementation)
// ============================================================================

/**
 * Placeholder adapter for LangChain integration.
 *
 * When to implement:
 * - Need complex chains with memory
 * - Want to use LangChain's extensive tool ecosystem
 * - Require LangSmith observability
 *
 * Implementation notes:
 * - Use @langchain/core for minimal dependencies
 * - Bridge LangChain tools to MCP format
 * - Consider langchain.js for TypeScript support
 */
export interface LangChainAdapterConfig {
  /** LangChain API key (for LangSmith) */
  langsmithApiKey?: string;
  /** Tools to import from LangChain */
  importTools?: string[];
  /** Custom chains to expose */
  chains?: Array<{ name: string; chainId: string }>;
}

// Stub - implement when needed
export class LangChainAdapter implements IExternalFrameworkAdapter {
  readonly name = "langchain";

  async isAvailable(): Promise<boolean> {
    // Check if langchain is installed
    try {
      // Dynamic import check would go here
      return false; // Not implemented yet
    } catch {
      return false;
    }
  }

  async importTools(): Promise<MCPTool[]> {
    throw new Error("LangChain adapter not implemented. Install @langchain/core to enable.");
  }

  async executeTool(_name: string, _args: Record<string, unknown>): Promise<MCPToolResult> {
    throw new Error("LangChain adapter not implemented");
  }
}

// ============================================================================
// Dify Adapter Stub (for future implementation)
// ============================================================================

/**
 * Placeholder adapter for Dify integration.
 *
 * When to implement:
 * - Need visual workflow builder
 * - Want to use Dify's RAG pipeline
 * - Require multi-model orchestration
 *
 * Implementation notes:
 * - Use Dify's REST API
 * - Map Dify apps to MCP tools
 * - Bridge Dify workflows as compound tools
 */
export interface DifyAdapterConfig {
  /** Dify API endpoint */
  endpoint: string;
  /** API key */
  apiKey: string;
  /** Apps to expose as tools */
  apps?: Array<{ name: string; appId: string }>;
}

// Stub - implement when needed
export class DifyAdapter implements IExternalFrameworkAdapter {
  readonly name = "dify";

  async isAvailable(): Promise<boolean> {
    return false; // Not implemented yet
  }

  async importTools(): Promise<MCPTool[]> {
    throw new Error("Dify adapter not implemented. Configure endpoint to enable.");
  }

  async executeTool(_name: string, _args: Record<string, unknown>): Promise<MCPToolResult> {
    throw new Error("Dify adapter not implemented");
  }

  async runWorkflow(_workflowId: string, _input: unknown): Promise<unknown> {
    throw new Error("Dify adapter not implemented");
  }
}

// ============================================================================
// Adapter Registry
// ============================================================================

/**
 * Registry for external framework adapters.
 * Allows dynamic registration and discovery of available integrations.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, IExternalFrameworkAdapter>();

  /**
   * Register an adapter.
   */
  register(adapter: IExternalFrameworkAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered`);
    }
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get an adapter by name.
   */
  get(name: string): IExternalFrameworkAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * List all registered adapters.
   */
  list(): IExternalFrameworkAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check which adapters are available.
   */
  async getAvailable(): Promise<IExternalFrameworkAdapter[]> {
    const checks = await Promise.all(
      this.list().map(async (adapter) => ({
        adapter,
        available: await safelyCheckAvailability(adapter),
      }))
    );
    return checks.filter((c) => c.available).map((c) => c.adapter);
  }
}

// ============================================================================
// External Tool Server (bridges adapters to MCP)
// ============================================================================

/**
 * Tool server that bridges external framework adapters to MCP protocol.
 * This allows external tools to be used alongside native MCP tools.
 */
export class ExternalToolServer implements MCPToolServer {
  readonly name: string;
  readonly description: string;

  private readonly adapter: IExternalFrameworkAdapter;
  private cachedTools: MCPTool[] = [];

  constructor(adapter: IExternalFrameworkAdapter) {
    this.adapter = adapter;
    this.name = `external:${adapter.name}`;
    this.description = `Tools from ${adapter.name} framework`;
  }

  async initialize(): Promise<void> {
    const available = await safelyCheckAvailability(this.adapter);
    if (!available) {
      this.cachedTools = [];
      return;
    }
    const tools = await this.adapter.importTools();
    this.cachedTools = tools.filter(hasValidPolicyAction);
  }

  listTools(): MCPTool[] {
    return this.cachedTools;
  }

  async callTool(call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    try {
      return await this.adapter.executeTool(call.name, call.arguments);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: "text", text: message }],
        error: { code: "EXECUTION_FAILED", message },
      };
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an adapter registry with optional pre-configured adapters.
 */
export function createAdapterRegistry(adapters?: IExternalFrameworkAdapter[]): AdapterRegistry {
  const registry = new AdapterRegistry();
  if (adapters) {
    for (const adapter of adapters) {
      registry.register(adapter);
    }
  }
  return registry;
}

function hasValidPolicyAction(tool: MCPTool): boolean {
  const policyAction = tool.annotations?.policyAction;
  return typeof policyAction === "string" && COWORK_POLICY_ACTIONS.includes(policyAction);
}

async function safelyCheckAvailability(adapter: IExternalFrameworkAdapter): Promise<boolean> {
  try {
    return await adapter.isAvailable();
  } catch {
    return false;
  }
}
