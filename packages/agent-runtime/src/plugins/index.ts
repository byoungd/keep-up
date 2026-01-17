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

// Base plugin
export { BasePlugin, Command, Hook, Tool } from "./basePlugin";
export type {
  DependencyGraph,
  MissingDependency,
  ResolutionResult,
  VersionConflict,
} from "./dependencyResolver";
// Dependency Resolver
export {
  createDependencyResolver,
  PluginDependencyResolver,
} from "./dependencyResolver";
export type { PluginLoaderConfig } from "./loader";
// Loader
export { createPluginLoader, PluginLoader } from "./loader";
export type {
  IPluginRegistry,
  IPluginResolver,
  PluginRegistryEntry,
  PluginSearchQuery,
  PluginSearchResult,
} from "./registry";
// Registry
export {
  createPluginRegistry,
  FileSystemPluginResolver,
  InMemoryPluginRegistry,
  NPMPluginResolver,
  satisfiesVersion,
} from "./registry";
// Types
export type {
  ActivationEvent,
  AfterAgentRunHookData,
  AfterLLMCallHookData,
  AfterToolCallHookData,
  AgentContribution,
  AgentFactory as PluginAgentFactory,
  AgentFactoryConfig,
  AgentRunResult as PluginAgentRunResult,
  BeforeAgentRunHookData,
  BeforeLLMCallHookData,
  BeforeToolCallHookData,
  CommandContribution,
  CommandHandler,
  ConfigurationContribution,
  Disposable,
  HookHandler,
  // Hooks
  HookType,
  // Plugin interface
  IPlugin,
  IPluginAgent,
  PluginCapability,
  PluginContext,
  PluginContributes,
  PluginDependency,
  PluginInfo,
  PluginLogger,
  // Manifest types
  PluginManifest,
  // State
  PluginState,
  PluginType,
  Progress,
  ToolContribution,
  ToolExecutionContext as PluginToolExecutionContext,
  // Handlers (prefixed with Plugin to avoid conflicts with tools module)
  ToolHandler as PluginToolHandler,
  ToolResult as PluginToolResult,
} from "./types";
