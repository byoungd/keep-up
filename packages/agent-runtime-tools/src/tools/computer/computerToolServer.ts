/**
 * Computer Tool Server
 *
 * Provides basic screen, pointer, and keyboard controls for computer-use workflows.
 */

import type { MCPTool, MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { BaseToolServer, errorResult } from "../mcp/baseServer";

export type ComputerMouseButton = "left" | "right" | "middle";

export interface ComputerScreenshot {
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface ComputerController {
  screenshot(options: {
    displayId?: string;
    format?: "png" | "jpeg";
    quality?: number;
    region?: { x: number; y: number; width: number; height: number };
  }): Promise<ComputerScreenshot>;
  movePointer(options: { x: number; y: number; durationMs?: number }): Promise<void>;
  click(options: {
    x: number;
    y: number;
    button?: ComputerMouseButton;
    clickCount?: number;
  }): Promise<void>;
  keypress(options: { key: string; modifiers?: string[]; repeat?: number }): Promise<void>;
  typeText(options: { text: string; delayMs?: number }): Promise<void>;
}

export interface ComputerToolServerOptions {
  controller: ComputerController;
}

export class ComputerToolServer extends BaseToolServer {
  readonly name = "computer";
  readonly description = "Computer-use tools for screen capture and input control.";

  private readonly controller: ComputerController;

  constructor(options: ComputerToolServerOptions) {
    super();
    this.controller = options.controller;

    this.registerTool(this.createScreenshotToolDef(), this.handleScreenshot.bind(this));
    this.registerTool(this.createPointerMoveToolDef(), this.handlePointerMove.bind(this));
    this.registerTool(this.createClickToolDef(), this.handleClick.bind(this));
    this.registerTool(this.createKeypressToolDef(), this.handleKeypress.bind(this));
    this.registerTool(this.createTypeToolDef(), this.handleType.bind(this));
  }

  private createScreenshotToolDef(): MCPTool {
    return {
      name: "screenshot",
      description: "Capture a screenshot of the current display.",
      inputSchema: {
        type: "object",
        properties: {
          displayId: { type: "string", description: "Optional display identifier." },
          format: {
            type: "string",
            enum: ["png", "jpeg"],
            description: "Image format (default: png).",
          },
          quality: { type: "number", description: "JPEG quality (0-100)." },
          region: {
            type: "object",
            description: "Optional capture region in screen coordinates.",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
          },
        },
      },
      annotations: {
        category: "control",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private createPointerMoveToolDef(): MCPTool {
    return {
      name: "pointer_move",
      description: "Move the pointer to an absolute screen coordinate.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (pixels)." },
          y: { type: "number", description: "Y coordinate (pixels)." },
          durationMs: { type: "number", description: "Optional move duration in ms." },
        },
        required: ["x", "y"],
      },
      annotations: {
        category: "control",
        requiresConfirmation: false,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private createClickToolDef(): MCPTool {
    return {
      name: "click",
      description: "Click at a screen coordinate.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (pixels)." },
          y: { type: "number", description: "Y coordinate (pixels)." },
          button: {
            type: "string",
            enum: ["left", "right", "middle"],
            description: "Mouse button to click.",
          },
          clickCount: { type: "number", description: "Number of clicks (default: 1)." },
        },
        required: ["x", "y"],
      },
      annotations: {
        category: "control",
        requiresConfirmation: false,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private createKeypressToolDef(): MCPTool {
    return {
      name: "keypress",
      description: "Press a keyboard key with optional modifiers.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to press (e.g. Enter, Tab, a)." },
          modifiers: {
            type: "array",
            description: "Optional modifier keys.",
            items: { type: "string" },
          },
          repeat: { type: "number", description: "Number of repeats (default: 1)." },
        },
        required: ["key"],
      },
      annotations: {
        category: "control",
        requiresConfirmation: false,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private createTypeToolDef(): MCPTool {
    return {
      name: "type",
      description: "Type text at the current cursor location.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type." },
          delayMs: { type: "number", description: "Delay between keystrokes in ms." },
        },
        required: ["text"],
      },
      annotations: {
        category: "control",
        requiresConfirmation: false,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private ensureComputerPermission(
    context: ToolContext,
    action: "screen" | "input"
  ): MCPToolResult | null {
    const permission = context.security.permissions.computer ?? "disabled";
    if (permission === "disabled") {
      return errorResult("PERMISSION_DENIED", "Computer use is disabled");
    }
    if (permission === "observe" && action !== "screen") {
      return errorResult("PERMISSION_DENIED", "Computer control is disabled");
    }
    return null;
  }

  private async handleScreenshot(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const permission = this.ensureComputerPermission(context, "screen");
    if (permission) {
      return permission;
    }

    try {
      const screenshot = await this.controller.screenshot({
        displayId: typeof args.displayId === "string" ? args.displayId : undefined,
        format: args.format === "jpeg" ? "jpeg" : args.format === "png" ? "png" : undefined,
        quality: typeof args.quality === "number" ? args.quality : undefined,
        region: isRegion(args.region) ? args.region : undefined,
      });

      return {
        success: true,
        content: [
          {
            type: "image",
            data: screenshot.data,
            mimeType: screenshot.mimeType,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", `Screenshot failed: ${message}`);
    }
  }

  private async handlePointerMove(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const permission = this.ensureComputerPermission(context, "input");
    if (permission) {
      return permission;
    }

    try {
      await this.controller.movePointer({
        x: args.x as number,
        y: args.y as number,
        durationMs: typeof args.durationMs === "number" ? args.durationMs : undefined,
      });
      return { success: true, content: [{ type: "text", text: "Pointer moved." }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", `Pointer move failed: ${message}`);
    }
  }

  private async handleClick(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const permission = this.ensureComputerPermission(context, "input");
    if (permission) {
      return permission;
    }

    try {
      await this.controller.click({
        x: args.x as number,
        y: args.y as number,
        button: isMouseButton(args.button) ? args.button : undefined,
        clickCount: typeof args.clickCount === "number" ? args.clickCount : undefined,
      });
      return { success: true, content: [{ type: "text", text: "Click executed." }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", `Click failed: ${message}`);
    }
  }

  private async handleKeypress(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const permission = this.ensureComputerPermission(context, "input");
    if (permission) {
      return permission;
    }

    try {
      await this.controller.keypress({
        key: args.key as string,
        modifiers: Array.isArray(args.modifiers)
          ? args.modifiers.filter((value) => typeof value === "string")
          : undefined,
        repeat: typeof args.repeat === "number" ? args.repeat : undefined,
      });
      return { success: true, content: [{ type: "text", text: "Key pressed." }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", `Keypress failed: ${message}`);
    }
  }

  private async handleType(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const permission = this.ensureComputerPermission(context, "input");
    if (permission) {
      return permission;
    }

    try {
      await this.controller.typeText({
        text: args.text as string,
        delayMs: typeof args.delayMs === "number" ? args.delayMs : undefined,
      });
      return { success: true, content: [{ type: "text", text: "Text typed." }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", `Typing failed: ${message}`);
    }
  }
}

export function createComputerToolServer(options: ComputerToolServerOptions): ComputerToolServer {
  return new ComputerToolServer(options);
}

function isRegion(
  value: unknown
): value is { x: number; y: number; width: number; height: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === "number" &&
    typeof record.y === "number" &&
    typeof record.width === "number" &&
    typeof record.height === "number"
  );
}

function isMouseButton(value: unknown): value is ComputerMouseButton {
  return value === "left" || value === "right" || value === "middle";
}
