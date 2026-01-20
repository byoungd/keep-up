/**
 * ComputerToolServer Tests
 */

import type { ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it, vi } from "vitest";

import { type ComputerController, ComputerToolServer } from "../tools/computer";

const mockController = (): ComputerController => ({
  screenshot: vi.fn(async () => ({
    data: "ZmFrZS1pbWFnZS1kYXRh",
    mimeType: "image/png",
    width: 100,
    height: 50,
  })),
  movePointer: vi.fn(async () => undefined),
  click: vi.fn(async () => undefined),
  keypress: vi.fn(async () => undefined),
  typeText: vi.fn(async () => undefined),
});

function createContext(
  permission: ToolContext["security"]["permissions"]["computer"]
): ToolContext {
  const base = SECURITY_PRESETS.safe;
  return {
    security: {
      sandbox: { ...base.sandbox },
      permissions: { ...base.permissions, computer: permission },
      limits: { ...base.limits },
    },
  };
}

describe("ComputerToolServer", () => {
  it("captures screenshots when observe permission is enabled", async () => {
    const controller = mockController();
    const server = new ComputerToolServer({ controller });
    const context = createContext("observe");

    const result = await server.callTool({ name: "screenshot", arguments: {} }, context);

    expect(result.success).toBe(true);
    expect(controller.screenshot).toHaveBeenCalled();
    expect(result.content[0]?.type).toBe("image");
  });

  it("denies input actions when permission is observe", async () => {
    const controller = mockController();
    const server = new ComputerToolServer({ controller });
    const context = createContext("observe");

    const result = await server.callTool({ name: "click", arguments: { x: 12, y: 24 } }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
    expect(controller.click).not.toHaveBeenCalled();
  });

  it("allows input actions when permission is control", async () => {
    const controller = mockController();
    const server = new ComputerToolServer({ controller });
    const context = createContext("control");

    const result = await server.callTool({ name: "click", arguments: { x: 12, y: 24 } }, context);

    expect(result.success).toBe(true);
    expect(controller.click).toHaveBeenCalled();
  });
});
