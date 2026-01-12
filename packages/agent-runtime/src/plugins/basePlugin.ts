/**
 * Base Plugin Class
 *
 * Abstract base class that plugins can extend for easier implementation.
 */

import type {
  AgentContribution,
  AgentFactory,
  CommandHandler,
  Disposable,
  HookHandler,
  HookType,
  IPlugin,
  PluginContext,
  PluginLogger,
  PluginManifest,
  ToolContribution,
  ToolHandler,
} from "./types";

/**
 * Abstract base class for plugins.
 * Provides common functionality and utilities.
 */
export abstract class BasePlugin implements IPlugin {
  abstract readonly manifest: PluginManifest;

  protected context!: PluginContext;
  protected log!: PluginLogger;

  /**
   * Activate the plugin.
   * Override setup() to add initialization logic.
   */
  async activate(context: PluginContext): Promise<void> {
    this.context = context;
    this.log = context.log;

    this.log.info(`Activating plugin: ${this.manifest.name} v${this.manifest.version}`);

    // Call setup hook
    await this.setup();

    // Auto-register contributions from manifest
    await this.registerContributions();

    this.log.info(`Plugin activated: ${this.manifest.name}`);
  }

  /**
   * Deactivate the plugin.
   * Override teardown() to add cleanup logic.
   */
  async deactivate(): Promise<void> {
    this.log.info(`Deactivating plugin: ${this.manifest.name}`);

    // Dispose all subscriptions
    for (const sub of this.context.subscriptions) {
      sub.dispose();
    }

    // Call teardown hook
    await this.teardown();

    this.log.info(`Plugin deactivated: ${this.manifest.name}`);
  }

  /**
   * Override to add initialization logic.
   */
  protected async setup(): Promise<void> {
    // Default: no-op
  }

  /**
   * Override to add cleanup logic.
   */
  protected async teardown(): Promise<void> {
    // Default: no-op
  }

  /**
   * Register a tool.
   */
  protected registerTool(
    nameOrContribution: string | ToolContribution,
    handler: ToolHandler
  ): Disposable {
    const contribution =
      typeof nameOrContribution === "string"
        ? { name: nameOrContribution, description: "", handler: "inline" }
        : nameOrContribution;

    return this.context.registerTool(contribution, handler);
  }

  /**
   * Register an agent type.
   */
  protected registerAgent(
    typeOrContribution: string | AgentContribution,
    factory: AgentFactory
  ): Disposable {
    const contribution =
      typeof typeOrContribution === "string"
        ? { type: typeOrContribution, name: typeOrContribution, description: "", handler: "inline" }
        : typeOrContribution;

    return this.context.registerAgent(contribution, factory);
  }

  /**
   * Register a command.
   */
  protected registerCommand(id: string, handler: CommandHandler): Disposable {
    return this.context.registerCommand(id, handler);
  }

  /**
   * Subscribe to a hook.
   */
  protected subscribeHook<T>(hook: HookType, handler: HookHandler<T>): Disposable {
    return this.context.subscribeHook(hook, handler);
  }

  /**
   * Get configuration value.
   */
  protected getConfig<T>(key: string): T | undefined {
    return this.context.getConfig(key);
  }

  /**
   * Set configuration value.
   */
  protected async setConfig<T>(key: string, value: T): Promise<void> {
    return this.context.setConfig(key, value);
  }

  /**
   * Show notification.
   */
  protected notify(message: string, type?: "info" | "warning" | "error"): void {
    this.context.showNotification(message, type);
  }

  /**
   * Auto-register contributions from manifest.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: registers multiple contribution types from manifest
  private async registerContributions(): Promise<void> {
    const { contributes } = this.manifest;
    if (!contributes) {
      return;
    }

    // Tools are registered via getToolHandlers()
    if (contributes.tools) {
      const handlers = this.getToolHandlers();
      for (const tool of contributes.tools) {
        const handler = handlers[tool.handler];
        if (handler) {
          const disposable = this.context.registerTool(tool, handler);
          this.context.subscriptions.push(disposable);
        } else {
          this.log.warn(`Tool handler not found: ${tool.handler}`);
        }
      }
    }

    // Agents are registered via getAgentFactories()
    if (contributes.agents) {
      const factories = this.getAgentFactories();
      for (const agent of contributes.agents) {
        const factory = factories[agent.handler];
        if (factory) {
          const disposable = this.context.registerAgent(agent, factory);
          this.context.subscriptions.push(disposable);
        } else {
          this.log.warn(`Agent factory not found: ${agent.handler}`);
        }
      }
    }

    // Commands are registered via getCommandHandlers()
    if (contributes.commands) {
      const handlers = this.getCommandHandlers();
      for (const command of contributes.commands) {
        const handler = handlers[command.handler];
        if (handler) {
          const disposable = this.context.registerCommand(command.id, handler);
          this.context.subscriptions.push(disposable);
        } else {
          this.log.warn(`Command handler not found: ${command.handler}`);
        }
      }
    }
  }

  /**
   * Override to provide tool handlers.
   * Return a map of handler name to handler function.
   */
  protected getToolHandlers(): Record<string, ToolHandler> {
    return {};
  }

  /**
   * Override to provide agent factories.
   * Return a map of handler name to factory function.
   */
  protected getAgentFactories(): Record<string, AgentFactory> {
    return {};
  }

  /**
   * Override to provide command handlers.
   * Return a map of handler name to handler function.
   */
  protected getCommandHandlers(): Record<string, CommandHandler> {
    return {};
  }
}

/**
 * Decorator to mark a method as a tool handler.
 */
export function Tool(name: string, description?: string) {
  return (_target: unknown, _propertyKey: string, _descriptor: PropertyDescriptor) => {
    // Store metadata for auto-registration
    // Implementation would use reflect-metadata
    void name;
    void description;
  };
}

/**
 * Decorator to mark a method as a command handler.
 */
export function Command(id: string) {
  return (_target: unknown, _propertyKey: string, _descriptor: PropertyDescriptor) => {
    void id;
  };
}

/**
 * Decorator to mark a method as a hook handler.
 */
export function Hook(type: HookType) {
  return (_target: unknown, _propertyKey: string, _descriptor: PropertyDescriptor) => {
    void type;
  };
}
