import type { ToolContext, ToolDefinition, ToolHandler, ValidationResult } from "./ToolHandler";
import { ValidationError } from "./ToolHandler";

export interface ToolMiddleware {
  name: string;
  execute(
    params: unknown,
    context: ToolContext,
    next: (params: unknown) => Promise<unknown>
  ): Promise<unknown>;
}

export class ToolCoordinator {
  private handlers = new Map<string, ToolHandler>();
  private middleware: ToolMiddleware[] = [];

  /** Register a tool handler */
  register(handler: ToolHandler): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(`Tool ${handler.name} already registered`);
    }
    this.handlers.set(handler.name, handler);
  }

  /** Register an alias for a tool */
  registerAlias(alias: string, targetName: string): void {
    const handler = this.handlers.get(targetName);
    if (!handler) {
      throw new Error(`Target tool ${targetName} not found`);
    }
    this.handlers.set(alias, handler);
  }

  /** Add middleware for cross-cutting concerns */
  use(middleware: ToolMiddleware): void {
    this.middleware.push(middleware);
  }

  /** Check if tool is registered */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** Get handler for a tool */
  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /** Execute a tool with middleware chain */
  async execute(name: string, params: unknown, context: ToolContext): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Tool ${name} not registered`);
    }

    const validation = this.validate(handler, params, context);
    if (!validation.valid) {
      throw new ValidationError(validation.errors ?? ["Invalid tool parameters"]);
    }

    const chain = this.buildChain(handler, context);
    return chain(params);
  }

  /** Get all registered tool definitions for LLM */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(new Set(this.handlers.values())).map((handler) => ({
      name: handler.name,
      description: handler.description,
      parameters: handler.schema,
    }));
  }

  private buildChain(
    handler: ToolHandler,
    context: ToolContext
  ): (params: unknown) => Promise<unknown> {
    let chain = (params: unknown) => handler.execute(params, context);

    for (let i = this.middleware.length - 1; i >= 0; i -= 1) {
      const current = chain;
      const mw = this.middleware[i];
      chain = (params) => mw.execute(params, context, current);
    }

    return chain;
  }

  private validate(handler: ToolHandler, params: unknown, context: ToolContext): ValidationResult {
    if (!handler.validate) {
      return { valid: true };
    }
    return handler.validate(params, context);
  }
}
