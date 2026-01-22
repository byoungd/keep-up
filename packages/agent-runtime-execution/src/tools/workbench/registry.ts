import type {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContext,
} from "@ku0/agent-runtime-core";
import type { RegistryEventHandler, RegistryEventType } from "@ku0/agent-runtime-tools";
import { createToolRegistry, type IToolRegistry } from "@ku0/agent-runtime-tools";

export class IsolatedToolRegistry implements IToolRegistry {
  private readonly overlay = createToolRegistry();

  constructor(private readonly baseRegistry: IToolRegistry) {}

  async register(server: MCPToolServer): Promise<void> {
    await this.overlay.register(server);
  }

  async unregister(serverName: string): Promise<void> {
    await this.overlay.unregister(serverName);
  }

  listTools(): MCPTool[] {
    const baseTools = this.baseRegistry.listTools();
    const overlayTools = this.overlay.listTools();
    const merged = new Map<string, MCPTool>();

    for (const tool of baseTools) {
      merged.set(tool.name, tool);
    }

    for (const tool of overlayTools) {
      merged.set(tool.name, tool);
    }

    return Array.from(merged.values());
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    if (this.overlay.hasTool(call.name)) {
      return this.overlay.callTool(call, context);
    }
    return this.baseRegistry.callTool(call, context);
  }

  getServer(name: string): MCPToolServer | undefined {
    return this.overlay.getServer(name) ?? this.baseRegistry.getServer(name);
  }

  hasTool(name: string): boolean {
    return this.overlay.hasTool(name) || this.baseRegistry.hasTool(name);
  }

  resolveToolServer(toolName: string): string | undefined {
    return (
      this.overlay.resolveToolServer?.(toolName) ?? this.baseRegistry.resolveToolServer?.(toolName)
    );
  }

  on(event: RegistryEventType, handler: RegistryEventHandler): () => void {
    const unsubscribers = [this.overlay.on(event, handler), this.baseRegistry.on(event, handler)];
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }
}

export function createIsolatedToolRegistry(baseRegistry: IToolRegistry): IsolatedToolRegistry {
  return new IsolatedToolRegistry(baseRegistry);
}
