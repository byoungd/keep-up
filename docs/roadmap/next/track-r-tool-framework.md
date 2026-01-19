# Track R: Tool Framework Enhancement

**Owner**: Runtime Developer  
**Status**: Proposed  
**Priority**: 🟡 High  
**Timeline**: Week 1-3  
**Dependencies**: Track L  
**Reference**: Cline `ToolExecutor.ts` (657 lines), Roo-Code tools (26 implementations)

---

## Objective

Build a robust, extensible tool framework with coordinator pattern, hook system, auto-approval, and comprehensive validation.

---

## Source Analysis

### From Cline ToolExecutor (657 lines)

```typescript
// Key patterns from Cline implementation

// 1. Tool Coordinator with Handler Registration (lines 206-239)
private registerToolHandlers(): void {
  const validator = new ToolValidator(this.clineIgnoreController);
  
  this.coordinator.register(new ListFilesToolHandler(validator));
  this.coordinator.register(new ReadFileToolHandler(validator));
  this.coordinator.register(new BrowserToolHandler());
  this.coordinator.register(new ExecuteCommandToolHandler(validator));
  this.coordinator.register(new UseMcpToolHandler());
  // ... 20+ more handlers
}

// 2. Execute with Validation (lines 341-405)
private async execute(block: ToolUse): Promise<boolean> {
  if (!this.coordinator.has(block.name)) {
    return false;
  }
  
  // Check rejection state
  if (this.taskState.didRejectTool) {
    this.createToolRejectionMessage(block, "User rejected previous tool");
    return true;
  }
  
  // Plan mode restrictions
  if (this.isPlanModeToolRestricted(block.name)) {
    await this.say("error", `Tool '${block.name}' not available in PLAN MODE`);
    return true;
  }
  
  // Handle partial vs complete blocks
  if (block.partial) {
    await this.handlePartialBlock(block, config);
  } else {
    await this.handleCompleteBlock(block, config);
  }
  
  return true;
}

// 3. Hook System Integration (lines 488-532)
private async runPostToolUseHook(
  block: ToolUse,
  toolResult: any,
  executionSuccess: boolean,
  executionStartTime: number
): Promise<boolean> {
  const { executeHook } = await import("../hooks/hook-executor");
  
  const postToolResult = await executeHook({
    hookName: "PostToolUse",
    hookInput: {
      postToolUse: {
        toolName: block.name,
        parameters: block.params,
        result: toolResult,
        success: executionSuccess,
        executionTimeMs: Date.now() - executionStartTime,
      },
    },
    isCancellable: true,
    say: this.say,
  });
  
  if (postToolResult.cancel) {
    await config.callbacks.cancelTask();
    return true;
  }
  
  if (postToolResult.contextModification) {
    this.addHookContextToConversation(postToolResult.contextModification, "PostToolUse");
  }
  
  return false;
}

// 4. Auto-Approval (lines 59-68)
private shouldAutoApproveTool(toolName: ClineDefaultTool): boolean | [boolean, boolean] {
  return this.autoApprover.shouldAutoApproveTool(toolName);
}
```

### From Roo-Code Tools (26 implementations)

```
ApplyDiffTool.ts (10KB)     - Diff application with validation
ApplyPatchTool.ts (15KB)    - Unified patch format
EditFileTool.ts (21KB)      - Inline editing with context
MultiApplyDiffTool.ts (26KB) - Multi-file diff operations
ReadFileTool.ts (32KB)      - File reading with windowing
ExecuteCommandTool.ts (13KB) - Shell command execution
```

---

## Tasks

### R1: Tool Coordinator Architecture (Week 1)

**Goal**: Implement coordinator pattern for tool registration and execution.

**Implementation**:

```typescript
// packages/agent-runtime-tools/src/coordinator/ToolCoordinator.ts

export interface ToolHandler<TParams = unknown, TResult = unknown> {
  /** Tool name for registration */
  readonly name: string;
  
  /** Tool description for LLM */
  readonly description: string;
  
  /** JSON Schema for parameters */
  readonly schema: JSONSchema;
  
  /** Execute the tool */
  execute(params: TParams, context: ToolContext): Promise<TResult>;
  
  /** Handle partial block for streaming UI (optional) */
  handlePartial?(block: PartialToolUse, context: ToolContext): Promise<void>;
  
  /** Validate parameters before execution (optional) */
  validate?(params: TParams, context: ToolContext): ValidationResult;
}

export interface ToolContext {
  /** Current working directory */
  cwd: string;
  
  /** Task ID */
  taskId: string;
  
  /** Auto-approval settings */
  autoApproval: AutoApprovalConfig;
  
  /** Services */
  services: ToolServices;
  
  /** Callbacks */
  callbacks: ToolCallbacks;
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
    
    // Validate parameters
    if (handler.validate) {
      const validation = handler.validate(params, context);
      if (!validation.valid) {
        throw new ValidationError(validation.errors);
      }
    }
    
    // Build middleware chain
    const chain = this.buildChain(handler, context);
    
    // Execute through chain
    return chain(params);
  }
  
  private buildChain(
    handler: ToolHandler, 
    context: ToolContext
  ): (params: unknown) => Promise<unknown> {
    let chain = (params: unknown) => handler.execute(params, context);
    
    // Apply middleware in reverse order
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const current = chain;
      const mw = this.middleware[i];
      chain = (params) => mw.execute(params, context, current);
    }
    
    return chain;
  }
  
  /** Get all registered tool definitions for LLM */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.handlers.values()).map(h => ({
      name: h.name,
      description: h.description,
      parameters: h.schema,
    }));
  }
}

// Middleware interface
export interface ToolMiddleware {
  name: string;
  execute(
    params: unknown, 
    context: ToolContext, 
    next: (params: unknown) => Promise<unknown>
  ): Promise<unknown>;
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-tools/src/coordinator/ToolCoordinator.ts`
- [ ] `packages/agent-runtime-tools/src/coordinator/ToolHandler.ts`
- [ ] Middleware chain for cross-cutting concerns
- [ ] Tool alias registration

---

### R2: Hook System (Week 2)

**Goal**: Pre/Post execution hooks for context modification and validation.

**Implementation**:

```typescript
// packages/agent-runtime-tools/src/hooks/HookExecutor.ts

export type HookType = "PreToolUse" | "PostToolUse" | "OnError";

export interface HookInput {
  preToolUse?: {
    toolName: string;
    parameters: unknown;
  };
  postToolUse?: {
    toolName: string;
    parameters: unknown;
    result: unknown;
    success: boolean;
    executionTimeMs: number;
  };
  onError?: {
    toolName: string;
    error: Error;
  };
}

export interface HookResult {
  /** Cancel the operation */
  cancel?: boolean;
  
  /** Was cancelled by user */
  wasCancelled?: boolean;
  
  /** Context to add to conversation */
  contextModification?: string;
  
  /** Error message to display */
  errorMessage?: string;
  
  /** Modified parameters (PreToolUse only) */
  modifiedParams?: unknown;
}

export interface HookConfig {
  /** Hook name for identification */
  name: string;
  
  /** Hook type */
  type: HookType;
  
  /** Tool names this hook applies to (* for all) */
  toolPatterns: string[];
  
  /** Script or command to execute */
  command: string;
  
  /** Timeout in milliseconds */
  timeoutMs: number;
  
  /** Whether cancellation is allowed */
  isCancellable: boolean;
}

export class HookExecutor {
  private hooks: HookConfig[] = [];
  
  register(config: HookConfig): void {
    this.hooks.push(config);
  }
  
  async execute(
    type: HookType,
    input: HookInput,
    toolName: string
  ): Promise<HookResult> {
    // Find matching hooks
    const matchingHooks = this.hooks.filter(h => 
      h.type === type && this.matchesPattern(toolName, h.toolPatterns)
    );
    
    if (matchingHooks.length === 0) {
      return {};
    }
    
    // Execute hooks in order
    let combinedResult: HookResult = {};
    
    for (const hook of matchingHooks) {
      const result = await this.executeHook(hook, input);
      
      // Merge results
      combinedResult = {
        ...combinedResult,
        ...result,
        contextModification: [
          combinedResult.contextModification,
          result.contextModification,
        ].filter(Boolean).join("\n"),
      };
      
      // Stop on cancel
      if (result.cancel) {
        break;
      }
    }
    
    return combinedResult;
  }
  
  private matchesPattern(toolName: string, patterns: string[]): boolean {
    return patterns.some(p => {
      if (p === "*") return true;
      if (p.endsWith("*")) {
        return toolName.startsWith(p.slice(0, -1));
      }
      return toolName === p;
    });
  }
  
  private async executeHook(
    hook: HookConfig, 
    input: HookInput
  ): Promise<HookResult> {
    // Execute command with input as JSON
    const { stdout, stderr } = await execWithTimeout(
      hook.command,
      JSON.stringify(input),
      hook.timeoutMs
    );
    
    try {
      return JSON.parse(stdout) as HookResult;
    } catch {
      return { contextModification: stdout };
    }
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-tools/src/hooks/HookExecutor.ts`
- [ ] `packages/agent-runtime-tools/src/hooks/HookConfig.ts`
- [ ] Pattern matching for tool selection
- [ ] Context modification support

---

### R3: Auto-Approval System (Week 3)

**Goal**: Policy-based automatic tool approval.

**Implementation**:

```typescript
// packages/agent-runtime-tools/src/approval/AutoApprover.ts

export interface ApprovalPolicy {
  /** Policy name */
  name: string;
  
  /** Tools this policy applies to */
  tools: string[];
  
  /** Approval action */
  action: "approve" | "deny" | "ask";
  
  /** Conditions for this policy */
  conditions?: ApprovalCondition[];
  
  /** Priority (higher = checked first) */
  priority: number;
}

export interface ApprovalCondition {
  type: "path" | "content" | "size" | "risk";
  operator: "equals" | "contains" | "matches" | "lessThan" | "greaterThan";
  value: string | number | RegExp;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  policyName?: string;
  requiresUserConfirmation: boolean;
}

export class AutoApprover {
  private policies: ApprovalPolicy[] = [];
  private userApprovalCache = new Map<string, ApprovalDecision>();
  
  constructor(private config: AutoApprovalConfig) {
    this.loadPolicies();
  }
  
  /** Check if tool should be auto-approved */
  shouldAutoApprove(
    toolName: string,
    params: unknown,
    workspaceContext: WorkspaceContext
  ): ApprovalDecision {
    // Check cache first
    const cacheKey = this.getCacheKey(toolName, params);
    if (this.userApprovalCache.has(cacheKey)) {
      return this.userApprovalCache.get(cacheKey)!;
    }
    
    // Path-based validation for file operations (from Cline analysis)
    if (this.isFileOperation(toolName) && params.path) {
      if (!this.isApprovedPath(params.path, workspaceContext)) {
        return {
          approved: false,
          requiresUserConfirmation: true,
          reason: "Path outside approved workspace",
        };
      }
    }
    
    // Find matching policy
    const policy = this.findMatchingPolicy(toolName, params);
    // ... rest of implementation
  }

  private isApprovedPath(targetPath: string, context: WorkspaceContext): boolean {
    // Verify path is within workspace boundaries
    // Caches workspace paths for performance (see source analysis)
    return context.workspacePaths.some(root => 
      targetPath.startsWith(root) && !targetPath.includes("..")
    );
  }
```

**Deliverables**:
- [ ] `packages/agent-runtime-tools/src/approval/AutoApprover.ts`
- [ ] `packages/agent-runtime-tools/src/approval/PolicyEngine.ts`
- [ ] Path validation with workspace boundary enforcement
- [ ] User approval caching

---

## Acceptance Criteria

- [ ] All 26+ tools migrated to coordinator pattern
- [ ] Middleware chain working for logging, timing
- [ ] PreToolUse and PostToolUse hooks executing
- [ ] Hook context visible in conversation
- [ ] Auto-approval policies configurable
- [ ] User approval scope (once/session/always)
- [ ] Zero regression on existing tool behavior

---

## Testing Requirements

```bash
# Unit tests
pnpm --filter @ku0/agent-runtime-tools test

# Integration tests
pnpm test:integration -- --grep "tool"

# Hook tests
pnpm --filter @ku0/agent-runtime-tools test -- --grep "hook"
```
