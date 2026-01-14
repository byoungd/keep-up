/**
 * LFCC Plugin Registry
 *
 * P2-3: Decoupled plugin architecture for the LFCC editor.
 * Allows dynamic registration and conditional loading of ProseMirror plugins.
 */

import type { LoroRuntime } from "@ku0/lfcc-bridge";
import type { Schema } from "prosemirror-model";
import type { Plugin } from "prosemirror-state";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PluginPriority = "core" | "feature" | "ui" | "optional";

export type PluginFactory<TConfig = unknown> = (
  context: PluginContext,
  config?: TConfig
) => Plugin | Plugin[] | null;

export interface PluginContext {
  runtime: LoroRuntime;
  schema: Schema;
  options: PluginRegistryOptions;
}

export interface PluginRegistryOptions {
  /** Enable PM history instead of Loro undo (default: false) */
  enableHistory?: boolean;
  /** Enable slash command menu (default: true) */
  enableSlashMenu?: boolean;
  /** Enable block handle for drag/drop (default: true) */
  enableBlockHandle?: boolean;
  /** Enable remote cursor display (default: true) */
  enableRemoteCursors?: boolean;
  /** Enable block behaviors (default: true) */
  enableBlockBehaviors?: boolean;
  /** Enable annotation handles (default: true) */
  enableAnnotationHandles?: boolean;
  /** Enable table editing (default: true) */
  enableTableEditing?: boolean;
  /** Minimal mode for testing (disables non-essential plugins) */
  minimalMode?: boolean;
}

export interface PluginRegistration {
  /** Unique identifier for the plugin */
  id: string;
  /** Display name for debugging */
  name: string;
  /** Plugin priority determines load order */
  priority: PluginPriority;
  /** Factory function to create the plugin */
  factory: PluginFactory;
  /** Optional condition to check if plugin should be loaded */
  condition?: (options: PluginRegistryOptions) => boolean;
  /** Dependencies on other plugin IDs */
  dependencies?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority Order
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<PluginPriority, number> = {
  core: 0,
  feature: 1,
  ui: 2,
  optional: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Registry Class
// ─────────────────────────────────────────────────────────────────────────────

export class PluginRegistry {
  private registrations = new Map<string, PluginRegistration>();

  /**
   * Register a plugin with the registry.
   */
  register(registration: PluginRegistration): void {
    if (this.registrations.has(registration.id)) {
      console.warn(`[PluginRegistry] Plugin "${registration.id}" already registered, overwriting`);
    }
    this.registrations.set(registration.id, registration);
  }

  /**
   * Unregister a plugin by ID.
   */
  unregister(id: string): boolean {
    return this.registrations.delete(id);
  }

  /**
   * Get all registered plugin IDs.
   */
  getRegisteredIds(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * Resolve plugins based on options and dependencies.
   * Returns plugins in the correct load order.
   */
  resolve(context: PluginContext): Plugin[] {
    const { options } = context;
    const plugins: Plugin[] = [];
    const resolved = new Set<string>();
    const resolving = new Set<string>();

    // Sort by priority first
    const sorted = Array.from(this.registrations.values()).sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Plugin resolution requires complex dependency graph traversal
    const resolvePlugin = (reg: PluginRegistration): void => {
      if (resolved.has(reg.id)) {
        return;
      }

      // Circular dependency check
      if (resolving.has(reg.id)) {
        console.error(`[PluginRegistry] Circular dependency detected for "${reg.id}"`);
        return;
      }

      resolving.add(reg.id);

      // Resolve dependencies first
      if (reg.dependencies) {
        for (const depId of reg.dependencies) {
          const dep = this.registrations.get(depId);
          if (dep) {
            resolvePlugin(dep);
          } else {
            console.warn(`[PluginRegistry] Missing dependency "${depId}" for "${reg.id}"`);
          }
        }
      }

      // Check condition
      if (reg.condition && !reg.condition(options)) {
        resolving.delete(reg.id);
        resolved.add(reg.id);
        return;
      }

      // Skip non-essential plugins in minimal mode
      if (options.minimalMode && reg.priority === "optional") {
        resolving.delete(reg.id);
        resolved.add(reg.id);
        return;
      }

      // Create plugin(s)
      try {
        const result = reg.factory(context);
        if (result) {
          if (Array.isArray(result)) {
            plugins.push(...result);
          } else {
            plugins.push(result);
          }
        }
      } catch (error) {
        console.error(`[PluginRegistry] Failed to create plugin "${reg.id}":`, error);
      }

      resolving.delete(reg.id);
      resolved.add(reg.id);
    };

    for (const reg of sorted) {
      resolvePlugin(reg);
    }

    return plugins;
  }

  /**
   * Create a new registry with default LFCC plugins.
   */
  static createDefault(): PluginRegistry {
    const registry = new PluginRegistry();
    // Default plugins are registered via registerDefaultPlugins()
    return registry;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Plugin Registrations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all default LFCC plugins with the registry.
 * This separates registration from the registry class itself.
 */
export async function registerDefaultPlugins(registry: PluginRegistry): Promise<void> {
  // Lazy import to avoid circular dependencies
  const { keymap } = await import("prosemirror-keymap");
  const { history } = await import("prosemirror-history");
  const { dropCursor } = await import("prosemirror-dropcursor");
  const { columnResizing, tableEditing } = await import("prosemirror-tables");
  const { reactKeys } = await import("@handlewithcare/react-prosemirror");

  // Import from reader app lib
  const { createBlockBehaviorsPlugin } = await import("@/lib/editor/blockBehaviors");
  const { createAnnotationPlugin } = await import("@/lib/annotations/annotationPlugin");
  const { createRemoteCursorPlugin } = await import("@/lib/editor/remoteCursorPlugin");
  const { createSlashMenuPlugin } = await import("@/lib/editor/slashMenuPlugin");
  const { createBlockHandlePlugin } = await import("@/lib/editor/blockHandlePlugin");
  const { createPastePipelinePlugin } = await import("@/lib/editor/pastePipelinePlugin");
  const { createMarkdownPastePlugin } = await import("@/lib/editor/markdownPastePlugin");
  const { createInputRulesPlugin } = await import("@/lib/editor/inputRulesPlugin");
  const { createKeymapPlugin } = await import("@/lib/editor/keymapPlugin");
  const { createAutoLinkPlugin } = await import("@/lib/editor/autoLinkPlugin");
  const { createHistoryTrackerPlugin } = await import("@/lib/editor/historyTrackerPlugin");
  const { createBlockMoveAnimationPlugin } = await import("@/lib/editor/blockMoveAnimationPlugin");

  // ─────────────────────────────────────────────────────────────────────────
  // Core Plugins (always loaded)
  // ─────────────────────────────────────────────────────────────────────────

  registry.register({
    id: "undo-redo",
    name: "Undo/Redo",
    priority: "core",
    factory: (ctx) => {
      if (ctx.options.enableHistory) {
        return history();
      }
      // Use Loro's undo manager via keymap
      return keymap({
        "Mod-z": () => {
          ctx.runtime.undoManager.undo();
          return true;
        },
        "Mod-y": () => {
          ctx.runtime.undoManager.redo();
          return true;
        },
        "Mod-Shift-z": () => {
          ctx.runtime.undoManager.redo();
          return true;
        },
      });
    },
  });

  registry.register({
    id: "drop-cursor",
    name: "Drop Cursor",
    priority: "core",
    factory: () =>
      dropCursor({
        class: "lfcc-drop-cursor",
        color: "var(--color-accent-indigo)",
        width: 2,
      }),
  });

  registry.register({
    id: "keymap",
    name: "Base Keymap",
    priority: "core",
    factory: (ctx) => createKeymapPlugin(ctx.schema),
  });

  registry.register({
    id: "input-rules",
    name: "Input Rules",
    priority: "core",
    factory: (ctx) => createInputRulesPlugin(ctx.schema),
  });

  registry.register({
    id: "react-keys",
    name: "React Keys",
    priority: "core",
    factory: () => reactKeys(),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Feature Plugins
  // ─────────────────────────────────────────────────────────────────────────

  registry.register({
    id: "block-behaviors",
    name: "Block Behaviors",
    priority: "feature",
    condition: (opts) => opts.enableBlockBehaviors !== false,
    factory: (ctx) => createBlockBehaviorsPlugin({ runtime: ctx.runtime }),
  });

  registry.register({
    id: "annotations",
    name: "Annotations",
    priority: "feature",
    factory: (ctx) =>
      createAnnotationPlugin({
        runtime: ctx.runtime,
        enableHandles: ctx.options.enableAnnotationHandles !== false,
      }),
  });

  registry.register({
    id: "paste-pipeline",
    name: "Paste Pipeline",
    priority: "feature",
    factory: () => createPastePipelinePlugin(),
  });

  registry.register({
    id: "markdown-paste",
    name: "Markdown Paste",
    priority: "feature",
    dependencies: ["paste-pipeline"],
    factory: () => createMarkdownPastePlugin(),
  });

  registry.register({
    id: "auto-link",
    name: "Auto Link",
    priority: "feature",
    factory: (ctx) => createAutoLinkPlugin(ctx.schema),
  });

  registry.register({
    id: "history-tracker",
    name: "History Tracker",
    priority: "feature",
    factory: () => createHistoryTrackerPlugin(),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UI Plugins
  // ─────────────────────────────────────────────────────────────────────────

  registry.register({
    id: "slash-menu",
    name: "Slash Menu",
    priority: "ui",
    condition: (opts) => opts.enableSlashMenu !== false,
    factory: () =>
      createSlashMenuPlugin({
        onStateChange: (_state) => {
          /* noop for registry */
        },
      }),
  });

  registry.register({
    id: "block-handle",
    name: "Block Handle",
    priority: "ui",
    condition: (opts) => opts.enableBlockHandle !== false,
    factory: () =>
      createBlockHandlePlugin({
        onStateChange: (_state) => {
          /* noop for registry */
        },
      }),
  });

  registry.register({
    id: "remote-cursors",
    name: "Remote Cursors",
    priority: "ui",
    condition: (opts) => opts.enableRemoteCursors !== false,
    factory: () => createRemoteCursorPlugin(),
  });

  registry.register({
    id: "block-move-animation",
    name: "Block Move Animation",
    priority: "ui",
    factory: () => createBlockMoveAnimationPlugin(),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Optional Plugins
  // ─────────────────────────────────────────────────────────────────────────

  registry.register({
    id: "table-column-resizing",
    name: "Table Column Resizing",
    priority: "optional",
    condition: (opts) => opts.enableTableEditing !== false,
    factory: () => columnResizing(),
  });

  registry.register({
    id: "table-editing",
    name: "Table Editing",
    priority: "optional",
    condition: (opts) => opts.enableTableEditing !== false,
    dependencies: ["table-column-resizing"],
    factory: () => tableEditing(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let defaultRegistry: PluginRegistry | null = null;

/**
 * Get or create the default plugin registry.
 */
export async function getDefaultPluginRegistry(): Promise<PluginRegistry> {
  if (!defaultRegistry) {
    defaultRegistry = PluginRegistry.createDefault();
    await registerDefaultPlugins(defaultRegistry);
  }
  return defaultRegistry;
}

/**
 * Reset the default registry (useful for testing).
 */
export function resetPluginRegistry(): void {
  defaultRegistry = null;
}
