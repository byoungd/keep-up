/**
 * Plugin System
 *
 * Provides a complete plugin architecture for extending the agent runtime.
 *
 * @example
 * ```typescript
 * import {
 *   createPluginLoader,
 *   createPluginRegistry,
 *   BasePlugin,
 * } from '@ku0/agent-runtime';
 *
 * // Create a custom plugin
 * class MyPlugin extends BasePlugin {
 *   readonly manifest = {
 *     id: 'com.example.my-plugin',
 *     name: 'My Plugin',
 *     version: '1.0.0',
 *     description: 'A custom plugin',
 *     type: 'tool' as const,
 *     main: './index.js',
 *     capabilities: ['tools:register' as const],
 *   };
 *
 *   protected async setup(): Promise<void> {
 *     this.registerTool('myTool', async (args) => {
 *       return { success: true, content: 'Hello from my tool!' };
 *     });
 *   }
 * }
 *
 * // Load plugins
 * const loader = createPluginLoader({
 *   pluginDataDir: './plugins',
 *   globalStorageDir: './storage',
 * });
 *
 * await loader.load(new MyPlugin());
 *
 * // Use registered tools
 * const handler = loader.getToolHandler('com.example.my-plugin:myTool');
 * ```
 */

// Types
export type {
  // Manifest types
  PluginManifest,
  PluginType,
  PluginCapability,
  PluginDependency,
  PluginContributes,
  ToolContribution,
  AgentContribution,
  CommandContribution,
  ConfigurationContribution,
  ActivationEvent,
  // Plugin interface
  IPlugin,
  PluginContext,
  PluginLogger,
  Disposable,
  Progress,
  // Handlers (prefixed with Plugin to avoid conflicts with tools module)
  ToolHandler as PluginToolHandler,
  ToolExecutionContext as PluginToolExecutionContext,
  ToolResult as PluginToolResult,
  AgentFactory as PluginAgentFactory,
  AgentFactoryConfig,
  IPluginAgent,
  AgentRunResult as PluginAgentRunResult,
  CommandHandler,
  // Hooks
  HookType,
  HookHandler,
  BeforeToolCallHookData,
  AfterToolCallHookData,
  BeforeAgentRunHookData,
  AfterAgentRunHookData,
  BeforeLLMCallHookData,
  AfterLLMCallHookData,
  // State
  PluginState,
  PluginInfo,
} from "./types";

// Base plugin
export { BasePlugin, Tool, Command, Hook } from "./basePlugin";

// Loader
export { PluginLoader, createPluginLoader } from "./loader";
export type { PluginLoaderConfig } from "./loader";

// Registry
export {
  InMemoryPluginRegistry,
  FileSystemPluginResolver,
  NPMPluginResolver,
  createPluginRegistry,
  satisfiesVersion,
} from "./registry";
export type {
  PluginSearchQuery,
  PluginSearchResult,
  PluginRegistryEntry,
  IPluginRegistry,
  IPluginResolver,
} from "./registry";

// Dependency Resolver
export {
  PluginDependencyResolver,
  createDependencyResolver,
} from "./dependencyResolver";
export type {
  DependencyGraph,
  ResolutionResult,
  MissingDependency,
  VersionConflict,
} from "./dependencyResolver";
