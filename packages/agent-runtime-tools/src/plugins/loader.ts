/**
 * Plugin Loader
 *
 * Loads and manages plugin lifecycle with security boundaries.
 */

import { createSubsystemLogger } from "@ku0/agent-runtime-telemetry/logging";
import type {
  AgentContribution,
  AgentFactory,
  CommandHandler,
  Disposable,
  HookHandler,
  HookType,
  IPlugin,
  PluginCapability,
  PluginContext,
  PluginInfo,
  PluginLogger,
  PluginManifest,
  Progress,
  ToolContribution,
  ToolHandler,
} from "./types";

// ============================================================================
// Plugin Loader Configuration
// ============================================================================

export interface PluginLoaderConfig {
  /** Directory to store plugin data */
  pluginDataDir: string;

  /** Global storage directory */
  globalStorageDir: string;

  /** Allowed capabilities (security boundary) */
  allowedCapabilities?: PluginCapability[];

  /** Whether to enable hot reload */
  hotReload?: boolean;

  /** Maximum plugin load time in milliseconds */
  loadTimeoutMs?: number;

  /** Logger for plugin loader */
  logger?: PluginLogger;
}

// ============================================================================
// Plugin Loader
// ============================================================================

export class PluginLoader {
  private readonly config: PluginLoaderConfig;
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly hooks = new Map<HookType, Set<HookRegistration>>();
  private readonly toolHandlers = new Map<string, RegisteredTool>();
  private readonly agentFactories = new Map<string, RegisteredAgent>();
  private readonly commandHandlers = new Map<string, RegisteredCommand>();
  private readonly log: PluginLogger;

  constructor(config: PluginLoaderConfig) {
    this.config = config;
    this.log = config.logger ?? createConsoleLogger("PluginLoader");
  }

  /**
   * Load a plugin from a module.
   */
  async load(pluginModule: IPlugin): Promise<void> {
    const manifest = pluginModule.manifest;
    const pluginId = manifest.id;

    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin already loaded: ${pluginId}`);
    }

    this.log.info(`Loading plugin: ${manifest.name} (${pluginId})`);

    // Validate manifest
    this.validateManifest(manifest);

    // Check capabilities
    this.validateCapabilities(manifest.capabilities);

    // Create plugin info
    const info: PluginInfo = {
      manifest,
      state: "loading",
      loadedAt: Date.now(),
    };

    const loadedPlugin: LoadedPlugin = {
      plugin: pluginModule,
      info,
      context: null as unknown as PluginContext,
      subscriptions: [],
    };

    this.plugins.set(pluginId, loadedPlugin);

    try {
      // Create plugin context
      const context = this.createPluginContext(loadedPlugin);
      loadedPlugin.context = context;

      // Activate plugin with timeout
      const timeoutMs = this.config.loadTimeoutMs ?? 30_000;
      await this.withTimeout(
        pluginModule.activate(context),
        timeoutMs,
        `Plugin activation timed out: ${pluginId}`
      );

      info.state = "active";
      info.activatedAt = Date.now();

      this.log.info(`Plugin loaded: ${manifest.name}`);
    } catch (error) {
      info.state = "error";
      info.error = error instanceof Error ? error.message : String(error);
      this.log.error(`Failed to load plugin: ${pluginId}`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin.
   */
  async unload(pluginId: string): Promise<void> {
    const loaded = this.plugins.get(pluginId);
    if (!loaded) {
      return;
    }

    this.log.info(`Unloading plugin: ${pluginId}`);

    loaded.info.state = "deactivating";

    try {
      // Deactivate plugin
      if (loaded.plugin.deactivate) {
        await loaded.plugin.deactivate();
      }

      // Dispose all registrations
      for (const sub of loaded.subscriptions) {
        sub.dispose();
      }

      // Remove from maps
      this.plugins.delete(pluginId);

      // Clean up all registrations for this plugin
      this.cleanupPluginRegistrations(pluginId);

      loaded.info.state = "unloaded";
      this.log.info(`Plugin unloaded: ${pluginId}`);
    } catch (error) {
      loaded.info.state = "error";
      loaded.info.error = error instanceof Error ? error.message : String(error);
      this.log.error(`Failed to unload plugin: ${pluginId}`, error);
      throw error;
    }
  }

  /**
   * Clean up all registrations for a plugin.
   */
  private cleanupPluginRegistrations(pluginId: string): void {
    // Clean up tool handlers
    for (const [name, reg] of this.toolHandlers) {
      if (reg.pluginId === pluginId) {
        this.toolHandlers.delete(name);
      }
    }

    // Clean up agent factories
    for (const [type, reg] of this.agentFactories) {
      if (reg.pluginId === pluginId) {
        this.agentFactories.delete(type);
      }
    }

    // Clean up command handlers
    for (const [id, reg] of this.commandHandlers) {
      if (reg.pluginId === pluginId) {
        this.commandHandlers.delete(id);
      }
    }

    // Clean up hooks
    for (const [, handlers] of this.hooks) {
      for (const handler of handlers) {
        if (handler.pluginId === pluginId) {
          handlers.delete(handler);
        }
      }
    }
  }

  /**
   * Get plugin info.
   */
  getPluginInfo(pluginId: string): PluginInfo | undefined {
    return this.plugins.get(pluginId)?.info;
  }

  /**
   * List all loaded plugins.
   */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => p.info);
  }

  /**
   * Get a registered tool handler.
   */
  getToolHandler(name: string): ToolHandler | undefined {
    return this.toolHandlers.get(name)?.handler;
  }

  /**
   * List all registered tools.
   */
  listTools(): ToolContribution[] {
    return Array.from(this.toolHandlers.values()).map((r) => r.contribution);
  }

  /**
   * Get an agent factory.
   */
  getAgentFactory(type: string): AgentFactory | undefined {
    return this.agentFactories.get(type)?.factory;
  }

  /**
   * List all registered agent types.
   */
  listAgentTypes(): AgentContribution[] {
    return Array.from(this.agentFactories.values()).map((r) => r.contribution);
  }

  /**
   * Execute a command.
   */
  async executeCommand(id: string, args?: Record<string, unknown>): Promise<void> {
    const reg = this.commandHandlers.get(id);
    if (!reg) {
      throw new Error(`Command not found: ${id}`);
    }
    await reg.handler(args);
  }

  /**
   * Run hooks for an event.
   */
  async runHooks<T>(type: HookType, data: T): Promise<T> {
    const handlers = this.hooks.get(type);
    if (!handlers || handlers.size === 0) {
      return data;
    }

    let result = data;
    for (const { handler } of handlers) {
      const hookResult = await handler(result);
      if (hookResult !== undefined) {
        result = hookResult as T;
      }
    }
    return result;
  }

  /**
   * Dispose all plugins.
   */
  async dispose(): Promise<void> {
    const pluginIds = Array.from(this.plugins.keys());
    for (const id of pluginIds) {
      await this.unload(id);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createPluginContext(loaded: LoadedPlugin): PluginContext {
    const pluginId = loaded.plugin.manifest.id;

    const context: PluginContext = {
      storagePath: `${this.config.pluginDataDir}/${pluginId}`,
      globalStoragePath: this.config.globalStorageDir,

      log: createConsoleLogger(pluginId),

      subscriptions: loaded.subscriptions,

      getConfig: <T>(key: string): T | undefined => {
        // Would integrate with config store
        void key;
        return undefined;
      },

      setConfig: async <T>(key: string, value: T): Promise<void> => {
        // Would integrate with config store
        void key;
        void value;
      },

      getSecret: async (key: string): Promise<string | undefined> => {
        // Would integrate with secret store
        void key;
        return undefined;
      },

      setSecret: async (key: string, value: string): Promise<void> => {
        // Would integrate with secret store
        void key;
        void value;
      },

      registerTool: (contribution: ToolContribution, handler: ToolHandler): Disposable => {
        const name = `${pluginId}:${contribution.name}`;
        this.toolHandlers.set(name, { pluginId, contribution: { ...contribution, name }, handler });
        return {
          dispose: () => {
            this.toolHandlers.delete(name);
          },
        };
      },

      registerAgent: (contribution: AgentContribution, factory: AgentFactory): Disposable => {
        const type = `${pluginId}:${contribution.type}`;
        this.agentFactories.set(type, {
          pluginId,
          contribution: { ...contribution, type },
          factory,
        });
        return {
          dispose: () => {
            this.agentFactories.delete(type);
          },
        };
      },

      registerCommand: (id: string, handler: CommandHandler): Disposable => {
        const fullId = `${pluginId}.${id}`;
        this.commandHandlers.set(fullId, { pluginId, id: fullId, handler });
        return {
          dispose: () => {
            this.commandHandlers.delete(fullId);
          },
        };
      },

      subscribeHook: <T>(type: HookType, handler: HookHandler<T>): Disposable => {
        let hookSet = this.hooks.get(type);
        if (!hookSet) {
          hookSet = new Set();
          this.hooks.set(type, hookSet);
        }
        const registration: HookRegistration = { pluginId, handler: handler as HookHandler };
        hookSet.add(registration);
        return {
          dispose: () => {
            this.hooks.get(type)?.delete(registration);
          },
        };
      },

      emit: (_event: string, _data: unknown): void => {
        // Would integrate with event bus
      },

      showNotification: (message: string, type?: "info" | "warning" | "error"): void => {
        // Would integrate with notification system
        const level = type === "warning" ? "warn" : (type ?? "info");
        this.log[level](`[${pluginId}] ${message}`);
      },

      withProgress: async <T>(
        title: string,
        task: (progress: Progress) => Promise<T>
      ): Promise<T> => {
        this.log.info(`[${pluginId}] ${title}`);
        const progress: Progress = {
          report: (value) => {
            if (value.message) {
              this.log.info(`[${pluginId}] ${value.message}`);
            }
          },
        };
        return task(progress);
      },
    };

    return context;
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id) {
      throw new Error("Plugin manifest missing id");
    }
    if (!manifest.name) {
      throw new Error("Plugin manifest missing name");
    }
    if (!manifest.version) {
      throw new Error("Plugin manifest missing version");
    }
    if (!manifest.type) {
      throw new Error("Plugin manifest missing type");
    }
    if (!manifest.main) {
      throw new Error("Plugin manifest missing main entry point");
    }
    if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
      throw new Error("Plugin manifest missing capabilities");
    }
  }

  private validateCapabilities(required: PluginCapability[]): void {
    const allowed = this.config.allowedCapabilities;
    if (!allowed) {
      return; // All capabilities allowed
    }

    for (const cap of required) {
      if (!allowed.includes(cap)) {
        throw new Error(`Plugin requires capability not allowed: ${cap}`);
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface LoadedPlugin {
  plugin: IPlugin;
  info: PluginInfo;
  context: PluginContext;
  subscriptions: Disposable[];
}

interface RegisteredTool {
  pluginId: string;
  contribution: ToolContribution;
  handler: ToolHandler;
}

interface RegisteredAgent {
  pluginId: string;
  contribution: AgentContribution;
  factory: AgentFactory;
}

interface RegisteredCommand {
  pluginId: string;
  id: string;
  handler: CommandHandler;
}

interface HookRegistration {
  pluginId: string;
  handler: HookHandler;
}

// ============================================================================
// Helpers
// ============================================================================

function createConsoleLogger(prefix: string): PluginLogger {
  const baseLogger = createSubsystemLogger("agent", "plugins");
  const logger =
    prefix === "PluginLoader"
      ? baseLogger.child({ component: "loader" })
      : baseLogger.forPlugin(prefix);
  return {
    debug: (msg, ...args) => logger.debug(`${msg}`, { args }),
    info: (msg, ...args) => logger.info(`${msg}`, { args }),
    warn: (msg, ...args) => logger.warn(`${msg}`, { args }),
    error: (msg, ...args) =>
      logger.error(`${msg}`, args[0] instanceof Error ? args[0] : undefined, { args }),
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a plugin loader.
 */
export function createPluginLoader(config: PluginLoaderConfig): PluginLoader {
  return new PluginLoader(config);
}
