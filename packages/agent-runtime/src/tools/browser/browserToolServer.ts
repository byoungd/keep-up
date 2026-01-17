/**
 * Browser Tool Server
 *
 * MCP-compatible browser automation using Playwright.
 */

import type { Locator, Page } from "playwright";
import type {
  AccessibilityNodeRef,
  AccessibilitySnapshot,
  BrowserManagerOptions,
  BrowserSessionConfig,
} from "../../browser";
import { BrowserManager } from "../../browser";
import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

export interface BrowserToolServerOptions {
  manager?: BrowserManager;
  managerOptions?: BrowserManagerOptions;
}

export class BrowserToolServer extends BaseToolServer {
  readonly name = "browser";
  readonly description = "Browser automation tools powered by Playwright";

  private readonly manager: BrowserManager;

  constructor(options: BrowserToolServerOptions = {}) {
    super();
    this.manager = options.manager ?? new BrowserManager(options.managerOptions ?? undefined);

    this.registerTool(this.createNavigateToolDef(), this.handleNavigate.bind(this));
    this.registerTool(this.createSnapshotToolDef(), this.handleSnapshot.bind(this));
    this.registerTool(this.createInteractToolDef(), this.handleInteract.bind(this));
    this.registerTool(this.createScreenshotToolDef(), this.handleScreenshot.bind(this));
    this.registerTool(this.createCloseToolDef(), this.handleClose.bind(this));
  }

  private createNavigateToolDef(): MCPTool {
    return {
      name: "navigate",
      description: "Navigate to a URL and wait for the page to load.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Destination URL",
          },
          sessionId: {
            type: "string",
            description: "Optional session override for browser context",
          },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "Navigation wait strategy",
          },
          timeoutMs: {
            type: "number",
            description: "Navigation timeout in milliseconds",
          },
          newContext: {
            type: "boolean",
            description: "Start a fresh browser context for this navigation",
          },
          recordVideo: {
            type: "boolean",
            description: "Enable recording if the manager is configured with a recording dir",
          },
          viewport: {
            type: "object",
            description: "Viewport size override",
            properties: {
              width: { type: "number" },
              height: { type: "number" },
            },
          },
        },
        required: ["url"],
      },
      annotations: {
        category: "external",
        requiresConfirmation: true,
        readOnly: false,
        estimatedDuration: "medium",
      },
    };
  }

  private createSnapshotToolDef(): MCPTool {
    return {
      name: "snapshot",
      description: "Capture an accessibility tree snapshot with @id references.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
          interestingOnly: {
            type: "boolean",
            description: "Return only interesting nodes (default: true)",
          },
        },
      },
      annotations: {
        category: "external",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private createInteractToolDef(): MCPTool {
    return {
      name: "interact",
      description: "Interact with an element via @id reference.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
          ref: { type: "string", description: "Accessibility @id reference (e.g. @12)" },
          selector: { type: "string", description: "Optional CSS/Playwright selector fallback" },
          action: {
            type: "string",
            enum: ["click", "type", "hover", "press", "focus"],
            description: "Interaction type",
          },
          text: { type: "string", description: "Text to type (for type action)" },
          key: { type: "string", description: "Key to press (for press action)" },
          delayMs: { type: "number", description: "Typing delay in milliseconds" },
        },
        required: ["action"],
      },
      annotations: {
        category: "external",
        requiresConfirmation: true,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private createScreenshotToolDef(): MCPTool {
    return {
      name: "screenshot",
      description: "Capture a screenshot of the current page.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
          fullPage: { type: "boolean", description: "Capture full page screenshot" },
        },
      },
      annotations: {
        category: "external",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private createCloseToolDef(): MCPTool {
    return {
      name: "close",
      description: "Close the browser session and release resources.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
        },
      },
      annotations: {
        category: "external",
        requiresConfirmation: false,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private async handleNavigate(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.network === "none") {
      return errorResult("PERMISSION_DENIED", "Network access is disabled");
    }
    const url = typeof args.url === "string" ? args.url : "";
    if (!url) {
      return errorResult("INVALID_ARGUMENTS", "url is required");
    }

    const sessionId = resolveSessionId(args, context);
    const sessionConfig = buildSessionConfig(args);
    const page = await this.manager.getPage(sessionId, sessionConfig);

    try {
      await page.goto(url, {
        waitUntil: parseWaitUntil(args.waitUntil),
        timeout: parseTimeout(args.timeoutMs),
      });
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Navigation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return textResult(`Navigated to ${page.url()}`);
  }

  private async handleSnapshot(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    try {
      const snapshot = await this.manager.snapshot(sessionId, {
        interestingOnly:
          typeof args.interestingOnly === "boolean" ? args.interestingOnly : undefined,
      });
      return textResult(JSON.stringify(snapshot, null, 2));
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Snapshot failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleInteract(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    const page = await this.manager.getPage(sessionId);
    const selector = typeof args.selector === "string" ? args.selector : undefined;
    const ref = typeof args.ref === "string" ? args.ref : undefined;
    const snapshot = await this.ensureSnapshot(sessionId);
    const resolved = resolveLocator(page, snapshot, { ref, selector });
    if (!resolved.locator) {
      return errorResult("INVALID_ARGUMENTS", resolved.reason ?? "ref or selector is required");
    }
    const locator = resolved.locator;
    const interaction = parseInteractionArgs(args);
    if (!interaction.interaction) {
      return errorResult("INVALID_ARGUMENTS", interaction.error ?? "action is required");
    }

    try {
      await locator.waitFor({ state: "visible", timeout: 10_000 });
      await performInteraction(locator, interaction.interaction);
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Interaction failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return textResult(`Action ${interaction.interaction.action} executed`);
  }

  private async handleScreenshot(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    const page = await this.manager.getPage(sessionId);
    try {
      const buffer = await page.screenshot({
        fullPage: typeof args.fullPage === "boolean" ? args.fullPage : false,
      });
      return {
        success: true,
        content: [
          {
            type: "image",
            data: buffer.toString("base64"),
            mimeType: "image/png",
          },
        ],
      };
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleClose(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    try {
      const result = await this.manager.closeSession(sessionId);
      if (result.recordingPath) {
        return textResult(`Closed session. Recording: ${result.recordingPath}`);
      }
      return textResult("Closed session.");
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Close failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async ensureSnapshot(sessionId: string): Promise<AccessibilitySnapshot> {
    const existing = this.manager.getSnapshot(sessionId);
    if (existing) {
      return existing;
    }
    return this.manager.snapshot(sessionId);
  }
}

export function createBrowserToolServer(options?: BrowserToolServerOptions): BrowserToolServer {
  return new BrowserToolServer(options);
}

function resolveSessionId(args: Record<string, unknown>, context: ToolContext): string {
  if (typeof args.sessionId === "string" && args.sessionId.length > 0) {
    return args.sessionId;
  }
  if (context.sessionId) {
    return context.sessionId;
  }
  return "default";
}

function parseWaitUntil(value: unknown): "load" | "domcontentloaded" | "networkidle" | undefined {
  if (value === "load" || value === "domcontentloaded" || value === "networkidle") {
    return value;
  }
  return undefined;
}

function parseTimeout(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildSessionConfig(args: Record<string, unknown>): BrowserSessionConfig | undefined {
  const recordVideo = typeof args.recordVideo === "boolean" ? args.recordVideo : undefined;
  const viewport = parseViewport(args.viewport);

  if (recordVideo === undefined && !viewport && typeof args.newContext !== "boolean") {
    return undefined;
  }

  return {
    newContext: typeof args.newContext === "boolean" ? args.newContext : undefined,
    recordVideo,
    viewport: viewport ?? undefined,
  };
}

function parseViewport(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { width?: unknown; height?: unknown };
  if (typeof record.width !== "number" || typeof record.height !== "number") {
    return null;
  }
  return { width: record.width, height: record.height };
}

function resolveLocator(
  page: Page,
  snapshot: AccessibilitySnapshot | undefined,
  input: { ref?: string; selector?: string }
): { locator: Locator | null; reason?: string } {
  if (input.selector) {
    return { locator: page.locator(input.selector) };
  }
  if (!input.ref) {
    return { locator: null, reason: "ref or selector is required" };
  }
  const nodeRef = snapshot?.map[input.ref];
  if (!nodeRef) {
    return { locator: null, reason: `Unknown ref: ${input.ref}` };
  }
  return { locator: resolveLocatorFromRef(page, nodeRef) };
}

function resolveLocatorFromRef(page: Page, ref: AccessibilityNodeRef): Locator {
  const role = typeof ref.role === "string" && ref.role.length > 0 ? ref.role : undefined;
  const name = typeof ref.name === "string" && ref.name.length > 0 ? ref.name : undefined;
  if (role) {
    try {
      const options = name ? { name } : undefined;
      // biome-ignore lint/suspicious/noExplicitAny: AriaRole is not exported in current playwright
      return page.getByRole(role as any, options).nth(ref.occurrence ?? 0);
    } catch {
      // Fallback to text selector
    }
  }
  if (name) {
    return page.getByText(name).nth(ref.occurrence ?? 0);
  }
  return page.getByText(ref.ref);
}

type InteractionRequest =
  | { action: "click" | "hover" | "focus" }
  | { action: "press"; key: string }
  | { action: "type"; text: string; delayMs?: number };

function parseInteractionArgs(args: Record<string, unknown>): {
  interaction?: InteractionRequest;
  error?: string;
} {
  const action = readStringArg(args.action);
  if (!action) {
    return { error: "action is required" };
  }
  if (action === "press") {
    return parsePressInteraction(args);
  }
  if (action === "type") {
    return parseTypeInteraction(args);
  }
  return parseSimpleInteraction(action);
}

function parsePressInteraction(args: Record<string, unknown>): {
  interaction?: InteractionRequest;
  error?: string;
} {
  const key = readStringArg(args.key);
  if (!key) {
    return { error: "key is required for press action" };
  }
  return { interaction: { action: "press", key } };
}

function parseTypeInteraction(args: Record<string, unknown>): {
  interaction?: InteractionRequest;
  error?: string;
} {
  const text = readStringArg(args.text);
  if (!text) {
    return { error: "text is required for type action" };
  }
  const delayMs = typeof args.delayMs === "number" ? args.delayMs : undefined;
  return { interaction: { action: "type", text, delayMs } };
}

function parseSimpleInteraction(action: string): {
  interaction?: InteractionRequest;
  error?: string;
} {
  if (action === "click" || action === "hover" || action === "focus") {
    return { interaction: { action } };
  }
  return { error: `Unsupported action: ${action}` };
}

function readStringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function performInteraction(
  locator: Locator,
  interaction: InteractionRequest
): Promise<void> {
  if (interaction.action === "click") {
    await locator.click();
    return;
  }
  if (interaction.action === "hover") {
    await locator.hover();
    return;
  }
  if (interaction.action === "focus") {
    await locator.focus();
    return;
  }
  if (interaction.action === "press") {
    await locator.press(interaction.key);
    return;
  }
  if (interaction.action === "type") {
    await locator.fill("");
    await locator.type(
      interaction.text,
      interaction.delayMs ? { delay: interaction.delayMs } : undefined
    );
  }
}
