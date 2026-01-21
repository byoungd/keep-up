import { SECURITY_PRESETS, type ToolContext } from "@ku0/agent-runtime-core";
import { describe, expect, it, vi } from "vitest";
import type { ComputerController } from "../computerToolServer";
import { ComputerToolServer } from "../computerToolServer";

const context: ToolContext = { security: SECURITY_PRESETS.balanced };

function createController(): ComputerController {
  return {
    screenshot: vi.fn(async () => ({ data: "", mimeType: "image/png" })),
    movePointer: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    keypress: vi.fn(async () => undefined),
    typeText: vi.fn(async () => undefined),
  };
}

describe("ComputerToolServer", () => {
  it("rejects invalid screenshot parameters", async () => {
    const controller = createController();
    const server = new ComputerToolServer({ controller });

    const qualityResult = await server.callTool(
      { name: "screenshot", arguments: { quality: "high" } },
      context
    );
    expect(qualityResult.success).toBe(false);
    expect(qualityResult.error?.code).toBe("INVALID_ARGUMENTS");
    expect(controller.screenshot).not.toHaveBeenCalled();

    const formatResult = await server.callTool(
      { name: "screenshot", arguments: { format: "gif" } },
      context
    );
    expect(formatResult.success).toBe(false);
    expect(formatResult.error?.code).toBe("INVALID_ARGUMENTS");

    const regionResult = await server.callTool(
      {
        name: "screenshot",
        arguments: { region: { x: 0, y: 0, width: -1, height: 10 } },
      },
      context
    );
    expect(regionResult.success).toBe(false);
    expect(regionResult.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects invalid pointer_move inputs", async () => {
    const controller = createController();
    const server = new ComputerToolServer({ controller });

    const result = await server.callTool({ name: "pointer_move", arguments: { x: 1 } }, context);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(controller.movePointer).not.toHaveBeenCalled();
  });

  it("rejects invalid click inputs", async () => {
    const controller = createController();
    const server = new ComputerToolServer({ controller });

    const result = await server.callTool(
      { name: "click", arguments: { x: 1, y: 2, button: "side" } },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(controller.click).not.toHaveBeenCalled();
  });

  it("rejects invalid keypress inputs", async () => {
    const controller = createController();
    const server = new ComputerToolServer({ controller });

    const keyResult = await server.callTool({ name: "keypress", arguments: { key: " " } }, context);
    expect(keyResult.success).toBe(false);
    expect(keyResult.error?.code).toBe("INVALID_ARGUMENTS");

    const modifierResult = await server.callTool(
      { name: "keypress", arguments: { key: "Enter", modifiers: [1] } },
      context
    );
    expect(modifierResult.success).toBe(false);
    expect(modifierResult.error?.code).toBe("INVALID_ARGUMENTS");

    const repeatResult = await server.callTool(
      { name: "keypress", arguments: { key: "Enter", repeat: 0 } },
      context
    );
    expect(repeatResult.success).toBe(false);
    expect(repeatResult.error?.code).toBe("INVALID_ARGUMENTS");
    expect(controller.keypress).not.toHaveBeenCalled();
  });

  it("rejects invalid type inputs", async () => {
    const controller = createController();
    const server = new ComputerToolServer({ controller });

    const result = await server.callTool({ name: "type", arguments: { text: 123 } }, context);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(controller.typeText).not.toHaveBeenCalled();
  });
});
