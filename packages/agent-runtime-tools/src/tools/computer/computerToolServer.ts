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
        policyAction: "connector.read",
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
        policyAction: "connector.action",
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
        policyAction: "connector.action",
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
        policyAction: "connector.action",
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
        policyAction: "connector.action",
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
      const displayId = parseOptionalString(args.displayId, "displayId");
      if (displayId.error) {
        return invalidArgs(displayId.error);
      }
      const format = parseOptionalEnum(args.format, "format", ["png", "jpeg"]);
      if (format.error) {
        return invalidArgs(format.error);
      }
      const quality = parseOptionalNumber(args.quality, "quality", { min: 0, max: 100 });
      if (quality.error) {
        return invalidArgs(quality.error);
      }
      const region = parseRegion(args.region);
      if (region.error) {
        return invalidArgs(region.error);
      }

      const screenshot = await this.controller.screenshot({
        displayId: displayId.value,
        format: format.value,
        quality: quality.value,
        region: region.value,
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
      const x = parseRequiredNumber(args.x, "x");
      if (x.error) {
        return invalidArgs(x.error);
      }
      const y = parseRequiredNumber(args.y, "y");
      if (y.error) {
        return invalidArgs(y.error);
      }
      const durationMs = parseOptionalNumber(args.durationMs, "durationMs", { min: 0 });
      if (durationMs.error) {
        return invalidArgs(durationMs.error);
      }

      await this.controller.movePointer({
        x: x.value,
        y: y.value,
        durationMs: durationMs.value,
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
      const x = parseRequiredNumber(args.x, "x");
      if (x.error) {
        return invalidArgs(x.error);
      }
      const y = parseRequiredNumber(args.y, "y");
      if (y.error) {
        return invalidArgs(y.error);
      }
      const button = parseOptionalEnum(args.button, "button", ["left", "right", "middle"]);
      if (button.error) {
        return invalidArgs(button.error);
      }
      const clickCount = parseOptionalNumber(args.clickCount, "clickCount", {
        min: 1,
        integer: true,
      });
      if (clickCount.error) {
        return invalidArgs(clickCount.error);
      }

      await this.controller.click({
        x: x.value,
        y: y.value,
        button: button.value,
        clickCount: clickCount.value,
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
      const key = parseRequiredString(args.key, "key");
      if (key.error) {
        return invalidArgs(key.error);
      }
      const modifiers = parseOptionalStringArray(args.modifiers, "modifiers");
      if (modifiers.error) {
        return invalidArgs(modifiers.error);
      }
      const repeat = parseOptionalNumber(args.repeat, "repeat", { min: 1, integer: true });
      if (repeat.error) {
        return invalidArgs(repeat.error);
      }

      await this.controller.keypress({
        key: key.value,
        modifiers: modifiers.value,
        repeat: repeat.value,
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
      const text = parseRequiredText(args.text, "text");
      if (text.error) {
        return invalidArgs(text.error);
      }
      const delayMs = parseOptionalNumber(args.delayMs, "delayMs", { min: 0 });
      if (delayMs.error) {
        return invalidArgs(delayMs.error);
      }

      await this.controller.typeText({
        text: text.value,
        delayMs: delayMs.value,
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

function invalidArgs(message: string): MCPToolResult {
  return errorResult("INVALID_ARGUMENTS", message);
}

function parseRequiredNumber(value: unknown, label: string): { value: number; error?: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: 0, error: `${label} must be a number` };
  }
  return { value };
}

function parseOptionalNumber(
  value: unknown,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): { value?: number; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: `${label} must be a number` };
  }
  const normalized = options.integer ? Math.floor(value) : value;
  if (options.min !== undefined && normalized < options.min) {
    return { error: `${label} must be >= ${options.min}` };
  }
  if (options.max !== undefined && normalized > options.max) {
    return { error: `${label} must be <= ${options.max}` };
  }
  return { value: normalized };
}

function parseOptionalString(value: unknown, label: string): { value?: string; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "string") {
    return { error: `${label} must be a string` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: `${label} must be a non-empty string` };
  }
  return { value: trimmed };
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[]
): { value?: T; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "string") {
    return { error: `${label} must be a string` };
  }
  if (!allowed.includes(value as T)) {
    return { error: `${label} must be one of: ${allowed.join(", ")}` };
  }
  return { value: value as T };
}

function parseOptionalStringArray(
  value: unknown,
  label: string
): { value?: string[]; error?: string } {
  if (value === undefined) {
    return {};
  }
  if (!Array.isArray(value)) {
    return { error: `${label} must be an array of strings` };
  }
  if (!value.every((entry) => typeof entry === "string")) {
    return { error: `${label} must be an array of strings` };
  }
  const normalized = value.map((entry) => entry.trim()).filter(Boolean);
  return normalized.length > 0 ? { value: normalized } : { value: [] };
}

function parseRequiredString(value: unknown, label: string): { value: string; error?: string } {
  if (typeof value !== "string") {
    return { value: "", error: `${label} is required` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: "", error: `${label} is required` };
  }
  return { value: trimmed };
}

function parseRequiredText(value: unknown, label: string): { value: string; error?: string } {
  if (typeof value !== "string") {
    return { value: "", error: `${label} must be a string` };
  }
  return { value };
}

function parseRegion(value: unknown): {
  value?: { x: number; y: number; width: number; height: number };
  error?: string;
} {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object") {
    return { error: "region must be an object" };
  }
  const record = value as Record<string, unknown>;
  const x = parseRequiredNumber(record.x, "region.x");
  if (x.error) {
    return { error: x.error };
  }
  const y = parseRequiredNumber(record.y, "region.y");
  if (y.error) {
    return { error: y.error };
  }
  const width = parseRequiredNumber(record.width, "region.width");
  if (width.error) {
    return { error: width.error };
  }
  const height = parseRequiredNumber(record.height, "region.height");
  if (height.error) {
    return { error: height.error };
  }
  if (width.value <= 0 || height.value <= 0) {
    return { error: "region width and height must be > 0" };
  }
  return { value: { x: x.value, y: y.value, width: width.value, height: height.value } };
}
