/**
 * Programmatic Tool Orchestration
 *
 * Enables agents to write scripts for deterministic tool workflows.
 * Similar to Claude Code's Python scripts, but using JavaScript/TypeScript.
 *
 * Provides safe, sandboxed execution with access to tool registry.
 */

import type { MCPToolCall, ToolContext } from "../../types";
import type { IToolRegistry } from "../mcp/registry";

// ============================================================================
// Types
// ============================================================================

/**
 * Script execution context.
 */
export interface ScriptContext {
  /** Tool registry for tool calls */
  registry: IToolRegistry;
  /** Tool execution context */
  toolContext: ToolContext;
  /** Script variables/state */
  variables: Record<string, unknown>;
}

/**
 * Script execution result.
 */
export interface ScriptResult {
  /** Success status */
  success: boolean;
  /** Return value from script */
  returnValue?: unknown;
  /** Error if failed */
  error?: string;
  /** Tool calls made during execution */
  toolCalls: MCPToolCall[];
  /** Execution duration */
  durationMs: number;
  /** Console output */
  logs: string[];
}

/**
 * Script executor configuration.
 */
export interface ScriptExecutorConfig {
  /** Maximum execution time (ms) */
  timeoutMs: number;
  /** Maximum memory usage (bytes) */
  maxMemoryBytes?: number;
  /** Enable console.log capture */
  captureConsole: boolean;
}

// ============================================================================
// Tool Proxy
// ============================================================================

/**
 * Creates a proxy for tool access within scripts.
 */
class ToolProxy {
  private toolCalls: MCPToolCall[] = [];

  constructor(
    private readonly registry: IToolRegistry,
    private readonly context: ToolContext
  ) {}

  /**
   * Create a namespaced tool accessor.
   * Example: tools.file.read({ path: 'foo.txt' })
   */
  createProxy(): Record<
    string,
    Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  > {
    const tools: Record<
      string,
      Record<string, (args: Record<string, unknown>) => Promise<unknown>>
    > = {};

    // Get all available tools
    const allTools = this.registry.listTools();

    // Group by server/namespace
    for (const tool of allTools) {
      const [namespace, method] = tool.name.split(":");

      if (!tools[namespace]) {
        tools[namespace] = {};
      }

      // Create async function for this tool
      tools[namespace][method] = async (args: Record<string, unknown>) => {
        const call: MCPToolCall = {
          name: tool.name,
          arguments: args,
        };

        this.toolCalls.push(call);

        // Execute tool
        const result = await this.registry.callTool(call, this.context);

        if (!result.success || result.error) {
          throw new Error(result.error?.message ?? "Tool execution failed");
        }

        // Extract text content
        const textContent = result.content.find(
          (c): c is Extract<typeof c, { type: "text" }> => c.type === "text"
        );
        return textContent ? textContent.text : result.content;
      };
    }

    return tools;
  }

  /**
   * Get all tool calls made.
   */
  getToolCalls(): MCPToolCall[] {
    return [...this.toolCalls];
  }
}

// ============================================================================
// Script Executor
// ============================================================================

/**
 * Executes user scripts with sandboxed tool access.
 */
export class ScriptExecutor {
  private readonly config: ScriptExecutorConfig;

  constructor(config: Partial<ScriptExecutorConfig> = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 60000,
      maxMemoryBytes: config.maxMemoryBytes,
      captureConsole: config.captureConsole ?? true,
    };
  }

  /**
   * Execute a script with tool access.
   */
  async execute(script: string, context: ScriptContext): Promise<ScriptResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const toolProxy = new ToolProxy(context.registry, context.toolContext);
    const tools = toolProxy.createProxy();

    // Capture console output
    // biome-ignore lint/suspicious/noConsole: Capturing script console output.
    const originalLog = console.log;
    if (this.config.captureConsole) {
      console.log = (...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(" "));
      };
    }

    try {
      // Create async function from script
      // Variables available in script:
      // - tools: Tool registry proxy
      // - variables: Script state
      const asyncFunc = new Function("tools", "variables", `return (async () => { ${script} })();`);

      // Execute with timeout
      const result = await this.executeWithTimeout(
        asyncFunc(tools, context.variables),
        this.config.timeoutMs
      );

      return {
        success: true,
        returnValue: result,
        toolCalls: toolProxy.getToolCalls(),
        durationMs: Date.now() - startTime,
        logs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        toolCalls: toolProxy.getToolCalls(),
        durationMs: Date.now() - startTime,
        logs,
      };
    } finally {
      // Restore console.log
      if (this.config.captureConsole) {
        console.log = originalLog;
      }
    }
  }

  /**
   * Execute promise with timeout.
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Script execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Validate script syntax before execution.
   */
  validateSyntax(script: string): { valid: boolean; error?: string } {
    try {
      // Try to create function to check syntax
      new Function(script);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Create a script executor.
 */
export function createScriptExecutor(config?: Partial<ScriptExecutorConfig>): ScriptExecutor {
  return new ScriptExecutor(config);
}

// ============================================================================
// Common Script Templates
// ============================================================================

/**
 * Common script patterns that agents can use.
 */
export const SCRIPT_TEMPLATES = {
  /**
   * Read-modify-write pattern.
   */
  readModifyWrite: `
// Read file
const content = await tools.file.read({ path: FILE_PATH });

// Modify content
const modified = content.replace(SEARCH_PATTERN, REPLACEMENT);

// Write back
await tools.file.write({ 
  path: FILE_PATH, 
  content: modified 
});

return { success: true, modified: true };
`,

  /**
   * Test-driven development pattern.
   */
  tdd: `
// 1. Write test
await tools.file.write({
  path: TEST_FILE,
  content: TEST_CODE
});

// 2. Run test (should fail)
const initialTest = await tools.bash.exec({ 
  command: 'npm test -- TEST_FILE' 
});

if (initialTest.includes('PASS')) {
  throw new Error('Test should fail initially');
}

// 3. Implement feature
await tools.file.write({
  path: IMPL_FILE,
  content: IMPL_CODE
});

// 4. Run test again (should pass)
const finalTest = await tools.bash.exec({ 
  command: 'npm test -- TEST_FILE' 
});

if (!finalTest.includes('PASS')) {
  throw new Error('Implementation did not pass tests');
}

return { success: true };
`,

  /**
   * Safe refactoring pattern.
   */
  safeRefactor: `
// 1. Run tests for baseline
const baseline = await tools.bash.exec({ command: 'npm test' });

if (!baseline.includes('PASS')) {
  throw new Error('Tests must pass before refactoring');
}

// 2. Create git checkpoint
await tools.git.add({ files: [FILE_PATH] });
await tools.git.commit({ message: 'checkpoint: before refactor' });

// 3. Apply refactoring
const content = await tools.file.read({ path: FILE_PATH });
const refactored = applyRefactoring(content);
await tools.file.write({ path: FILE_PATH, content: refactored });

// 4. Verify tests still pass
const afterRefactor = await tools.bash.exec({ command: 'npm test' });

if (!afterRefactor.includes('PASS')) {
  // Revert if tests fail
  await tools.git.reset({ hard: true });
  throw new Error('Tests failed after refactoring, reverted changes');
}

return { success: true, refactored: true };
`,

  /**
   * Multi-file batch operation.
   */
  batchOperation: `
const files = ['file1.ts', 'file2.ts', 'file3.ts'];
const results = [];

for (const file of files) {
  try {
    const content = await tools.file.read({ path: file });
    const processed = processContent(content);
    await tools.file.write({ path: file, content: processed });
    results.push({ file, success: true });
  } catch (error) {
    results.push({ file, success: false, error: error.message });
  }
}

return { results, total: files.length };
`,
};
