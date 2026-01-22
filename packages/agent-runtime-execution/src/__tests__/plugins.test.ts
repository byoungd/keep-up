/**
 * Plugin System Tests
 */

import type { BeforeToolCallHookData, PluginManifest } from "@ku0/agent-runtime-tools";
import {
  BasePlugin,
  createPluginLoader,
  createPluginRegistry,
  satisfiesVersion,
} from "@ku0/agent-runtime-tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Test Plugin Implementations
// ============================================================================

class TestToolPlugin extends BasePlugin {
  readonly manifest: PluginManifest = {
    id: "com.test.tool-plugin",
    name: "Test Tool Plugin",
    version: "1.0.0",
    description: "A test plugin that provides a tool",
    type: "tool",
    main: "./index.js",
    capabilities: ["tools:register"],
  };

  public setupCalled = false;
  public teardownCalled = false;

  protected async setup(): Promise<void> {
    this.setupCalled = true;

    this.registerTool("echo", async (args) => {
      const message = args.message as string;
      return {
        success: true,
        content: `Echo: ${message}`,
      };
    });
  }

  protected async teardown(): Promise<void> {
    this.teardownCalled = true;
  }
}

class TestHookPlugin extends BasePlugin {
  readonly manifest: PluginManifest = {
    id: "com.test.hook-plugin",
    name: "Test Hook Plugin",
    version: "1.0.0",
    description: "A test plugin that subscribes to hooks",
    type: "extension",
    main: "./index.js",
    capabilities: ["hooks:subscribe"],
  };

  public hookCalls: string[] = [];

  protected async setup(): Promise<void> {
    this.subscribeHook<BeforeToolCallHookData>("beforeToolCall", async (data) => {
      this.hookCalls.push(`beforeToolCall:${data.toolName}`);
      return data;
    });
  }
}

class TestCommandPlugin extends BasePlugin {
  readonly manifest: PluginManifest = {
    id: "com.test.command-plugin",
    name: "Test Command Plugin",
    version: "1.0.0",
    description: "A test plugin that provides commands",
    type: "extension",
    main: "./index.js",
    capabilities: ["tools:register"],
  };

  public commandExecuted = false;
  public commandArgs: Record<string, unknown> | undefined;

  protected async setup(): Promise<void> {
    this.registerCommand("sayHello", async (args) => {
      this.commandExecuted = true;
      this.commandArgs = args;
    });
  }
}

// ============================================================================
// Plugin Loader Tests
// ============================================================================

describe("PluginLoader", () => {
  let loader: ReturnType<typeof createPluginLoader>;

  beforeEach(() => {
    loader = createPluginLoader({
      pluginDataDir: "/tmp/plugins",
      globalStorageDir: "/tmp/global",
    });
  });

  describe("load", () => {
    it("should load a plugin successfully", async () => {
      const plugin = new TestToolPlugin();

      await loader.load(plugin);

      expect(plugin.setupCalled).toBe(true);
      const info = loader.getPluginInfo("com.test.tool-plugin");
      expect(info).toBeDefined();
      expect(info?.state).toBe("active");
    });

    it("should register tools from plugin", async () => {
      const plugin = new TestToolPlugin();
      await loader.load(plugin);

      const handler = loader.getToolHandler("com.test.tool-plugin:echo");
      expect(handler).toBeDefined();

      if (!handler) {
        throw new Error("Handler should be defined");
      }

      const result = await handler(
        { message: "hello" },
        {
          log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }
      );
      expect(result.success).toBe(true);
      expect(result.content).toBe("Echo: hello");
    });

    it("should reject duplicate plugin loads", async () => {
      const plugin = new TestToolPlugin();
      await loader.load(plugin);

      await expect(loader.load(plugin)).rejects.toThrow("Plugin already loaded");
    });

    it("should reject plugins with missing manifest fields", async () => {
      const invalidPlugin = {
        manifest: {
          id: "invalid",
          // Missing required fields
        },
        activate: async () => {
          // Empty activate for invalid plugin test
        },
      };

      // biome-ignore lint/suspicious/noExplicitAny: testing invalid plugin shape
      await expect(loader.load(invalidPlugin as any)).rejects.toThrow("missing");
    });
  });

  describe("unload", () => {
    it("should unload a plugin and call teardown", async () => {
      const plugin = new TestToolPlugin();
      await loader.load(plugin);

      await loader.unload("com.test.tool-plugin");

      expect(plugin.teardownCalled).toBe(true);
      expect(loader.getPluginInfo("com.test.tool-plugin")).toBeUndefined();
    });

    it("should remove tool handlers when plugin unloads", async () => {
      const plugin = new TestToolPlugin();
      await loader.load(plugin);

      const handlerBefore = loader.getToolHandler("com.test.tool-plugin:echo");
      expect(handlerBefore).toBeDefined();

      await loader.unload("com.test.tool-plugin");

      const handlerAfter = loader.getToolHandler("com.test.tool-plugin:echo");
      expect(handlerAfter).toBeUndefined();
    });

    it("should handle unloading non-existent plugin gracefully", async () => {
      await expect(loader.unload("non-existent")).resolves.toBeUndefined();
    });
  });

  describe("hooks", () => {
    it("should register and run hooks", async () => {
      const hookPlugin = new TestHookPlugin();
      await loader.load(hookPlugin);

      const data: BeforeToolCallHookData = {
        toolName: "test:tool",
        arguments: {},
        context: {
          log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      };

      await loader.runHooks("beforeToolCall", data);

      expect(hookPlugin.hookCalls).toContain("beforeToolCall:test:tool");
    });

    it("should allow hooks to transform data", async () => {
      // Create a plugin that transforms hook data
      class TransformPlugin extends BasePlugin {
        readonly manifest: PluginManifest = {
          id: "com.test.transform",
          name: "Transform Plugin",
          version: "1.0.0",
          description: "Transforms hook data",
          type: "extension",
          main: "./index.js",
          capabilities: ["hooks:subscribe"],
        };

        protected async setup(): Promise<void> {
          this.subscribeHook<{ value: number }>("onProgress", async (data) => {
            return { value: data.value * 2 };
          });
        }
      }

      const plugin = new TransformPlugin();
      await loader.load(plugin);

      const result = await loader.runHooks("onProgress", { value: 10 });
      expect(result).toEqual({ value: 20 });
    });
  });

  describe("commands", () => {
    it("should register and execute commands", async () => {
      const plugin = new TestCommandPlugin();
      await loader.load(plugin);

      await loader.executeCommand("com.test.command-plugin.sayHello", { name: "World" });

      expect(plugin.commandExecuted).toBe(true);
      expect(plugin.commandArgs).toEqual({ name: "World" });
    });

    it("should reject unknown commands", async () => {
      await expect(loader.executeCommand("unknown.command")).rejects.toThrow("Command not found");
    });
  });

  describe("listPlugins", () => {
    it("should list all loaded plugins", async () => {
      await loader.load(new TestToolPlugin());
      await loader.load(new TestHookPlugin());

      const plugins = loader.listPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins.map((p) => p.manifest.id)).toContain("com.test.tool-plugin");
      expect(plugins.map((p) => p.manifest.id)).toContain("com.test.hook-plugin");
    });
  });

  describe("listTools", () => {
    it("should list all registered tools", async () => {
      await loader.load(new TestToolPlugin());

      const tools = loader.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("com.test.tool-plugin:echo");
    });
  });

  describe("capability validation", () => {
    it("should reject plugins requiring disallowed capabilities", async () => {
      const restrictedLoader = createPluginLoader({
        pluginDataDir: "/tmp/plugins",
        globalStorageDir: "/tmp/global",
        allowedCapabilities: ["tools:register"],
      });

      const plugin = {
        manifest: {
          id: "com.test.network-plugin",
          name: "Network Plugin",
          version: "1.0.0",
          description: "Requires network",
          type: "extension" as const,
          main: "./index.js",
          capabilities: ["network" as const], // Not allowed
        },
        activate: async () => {
          // Empty activate for capability test
        },
      };

      await expect(restrictedLoader.load(plugin)).rejects.toThrow("capability not allowed");
    });
  });

  describe("dispose", () => {
    it("should unload all plugins", async () => {
      const plugin1 = new TestToolPlugin();
      const plugin2 = new TestHookPlugin();

      await loader.load(plugin1);
      await loader.load(plugin2);

      await loader.dispose();

      expect(loader.listPlugins()).toHaveLength(0);
      expect(plugin1.teardownCalled).toBe(true);
    });
  });
});

// ============================================================================
// Plugin Registry Tests
// ============================================================================

describe("InMemoryPluginRegistry", () => {
  let registry: ReturnType<typeof createPluginRegistry>;

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  describe("register", () => {
    it("should register a plugin", async () => {
      const manifest: PluginManifest = {
        id: "com.example.test",
        name: "Test Plugin",
        version: "1.0.0",
        description: "A test plugin",
        type: "tool",
        main: "./index.js",
        capabilities: ["tools:register"],
      };

      await registry.register(manifest, "/path/to/plugin");

      const entry = await registry.get("com.example.test");
      expect(entry).toBeDefined();
      expect(entry?.manifest.name).toBe("Test Plugin");
      expect(entry?.source).toBe("/path/to/plugin");
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await registry.register(
        {
          id: "com.example.tool1",
          name: "File Tool",
          version: "1.0.0",
          description: "File operations",
          type: "tool",
          main: "./index.js",
          capabilities: ["filesystem"],
          keywords: ["file", "io"],
        },
        "/path/1"
      );

      await registry.register(
        {
          id: "com.example.tool2",
          name: "Network Tool",
          version: "2.0.0",
          description: "Network operations",
          type: "tool",
          main: "./index.js",
          capabilities: ["network"],
          author: "Example Inc",
          keywords: ["http", "api"],
        },
        "/path/2"
      );

      await registry.register(
        {
          id: "com.example.agent1",
          name: "Research Agent",
          version: "1.0.0",
          description: "Research assistant",
          type: "agent",
          main: "./index.js",
          capabilities: ["network"],
        },
        "/path/3"
      );
    });

    it("should search by text", async () => {
      const result = await registry.search({ text: "network" });
      // Only "Network Tool" has "network" in name/description
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].manifest.name).toBe("Network Tool");
    });

    it("should filter by type", async () => {
      const result = await registry.search({ type: "agent" });
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].manifest.name).toBe("Research Agent");
    });

    it("should filter by capabilities", async () => {
      const result = await registry.search({ capabilities: ["filesystem"] });
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].manifest.name).toBe("File Tool");
    });

    it("should filter by author", async () => {
      const result = await registry.search({ author: "Example Inc" });
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].manifest.name).toBe("Network Tool");
    });

    it("should filter by keywords", async () => {
      const result = await registry.search({ keywords: ["file"] });
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].manifest.name).toBe("File Tool");
    });

    it("should paginate results", async () => {
      const result = await registry.search({ offset: 1, limit: 1 });
      expect(result.plugins).toHaveLength(1);
      expect(result.total).toBe(3);
    });
  });

  describe("checkUpdates", () => {
    it("should detect available updates", async () => {
      await registry.register(
        {
          id: "com.example.plugin",
          name: "Plugin",
          version: "2.0.0",
          description: "Test",
          type: "tool",
          main: "./index.js",
          capabilities: [],
        },
        "/path"
      );

      const updates = await registry.checkUpdates([
        {
          manifest: {
            id: "com.example.plugin",
            name: "Plugin",
            version: "1.0.0",
            description: "Test",
            type: "tool",
            main: "./index.js",
            capabilities: [],
          },
          state: "active",
        },
      ]);

      expect(updates).toHaveLength(1);
      expect(updates[0].updateAvailable).toBe("2.0.0");
      expect(updates[0].installedVersion).toBe("1.0.0");
    });
  });

  describe("unregister", () => {
    it("should remove a plugin", async () => {
      await registry.register(
        {
          id: "com.example.test",
          name: "Test",
          version: "1.0.0",
          description: "Test",
          type: "tool",
          main: "./index.js",
          capabilities: [],
        },
        "/path"
      );

      await registry.unregister("com.example.test");

      const entry = await registry.get("com.example.test");
      expect(entry).toBeUndefined();
    });
  });
});

// ============================================================================
// Version Utilities Tests
// ============================================================================

describe("satisfiesVersion", () => {
  it("should match exact versions", () => {
    expect(satisfiesVersion("1.0.0", "1.0.0")).toBe(true);
    expect(satisfiesVersion("1.0.1", "1.0.0")).toBe(false);
  });

  it("should handle caret ranges", () => {
    expect(satisfiesVersion("1.1.0", "^1.0.0")).toBe(true);
    expect(satisfiesVersion("1.0.5", "^1.0.0")).toBe(true);
    expect(satisfiesVersion("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfiesVersion("0.9.0", "^1.0.0")).toBe(false);
  });

  it("should handle tilde ranges", () => {
    expect(satisfiesVersion("1.0.5", "~1.0.0")).toBe(true);
    expect(satisfiesVersion("1.1.0", "~1.0.0")).toBe(false);
  });

  it("should handle greater than", () => {
    expect(satisfiesVersion("2.0.0", ">1.0.0")).toBe(true);
    expect(satisfiesVersion("1.0.0", ">1.0.0")).toBe(false);
  });

  it("should handle greater than or equal", () => {
    expect(satisfiesVersion("1.0.0", ">=1.0.0")).toBe(true);
    expect(satisfiesVersion("2.0.0", ">=1.0.0")).toBe(true);
    expect(satisfiesVersion("0.9.0", ">=1.0.0")).toBe(false);
  });
});
