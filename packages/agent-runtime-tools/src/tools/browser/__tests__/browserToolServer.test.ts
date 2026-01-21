import type { ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import type { Locator, Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { AccessibilitySnapshot, BrowserManager } from "../../../browser";
import { BrowserToolServer } from "../browserToolServer";

type StubPage = Page & {
  _goto: ReturnType<typeof vi.fn>;
  _locator: Locator;
};

function createStubLocator(): Locator {
  return {
    waitFor: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    hover: vi.fn(async () => undefined),
    focus: vi.fn(async () => undefined),
    press: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    type: vi.fn(async () => undefined),
  } as unknown as Locator;
}

function createStubPage(url = "https://example.com/"): StubPage {
  const locator = createStubLocator();
  const goto = vi.fn(async () => undefined);

  return {
    _goto: goto,
    _locator: locator,
    goto,
    url: () => url,
    locator: vi.fn(() => locator),
    getByRole: vi.fn(() => locator),
    getByText: vi.fn(() => locator),
    screenshot: vi.fn(async () => Buffer.from("")),
  } as unknown as StubPage;
}

function createStubManager(
  page: Page,
  snapshot?: AccessibilitySnapshot
): {
  manager: BrowserManager;
  snapshotSpy: ReturnType<typeof vi.fn>;
  getPageSpy: ReturnType<typeof vi.fn>;
} {
  const snapshotSpy = vi.fn(async () => snapshot ?? { map: {} });
  const getPageSpy = vi.fn(async () => page);
  const manager = {
    getPage: getPageSpy,
    snapshot: snapshotSpy,
    getSnapshot: vi.fn(() => snapshot),
    closeSession: vi.fn(async () => ({ recordingPath: undefined })),
  } as unknown as BrowserManager;
  return { manager, snapshotSpy, getPageSpy };
}

function createContext(security: ToolContext["security"], sessionId = "session"): ToolContext {
  return { security, sessionId };
}

describe("BrowserToolServer", () => {
  it("blocks navigation when network access is disabled", async () => {
    const page = createStubPage();
    const { manager, getPageSpy } = createStubManager(page);
    const server = new BrowserToolServer({ manager });
    const context = createContext(SECURITY_PRESETS.safe);

    const result = await server.callTool(
      { name: "navigate", arguments: { url: "https://example.com" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
    expect(getPageSpy).not.toHaveBeenCalled();
  });

  it("rejects non-http urls", async () => {
    const page = createStubPage();
    const { manager, getPageSpy } = createStubManager(page);
    const server = new BrowserToolServer({ manager });
    const context = createContext(SECURITY_PRESETS.power);

    const result = await server.callTool(
      { name: "navigate", arguments: { url: "file:///etc/passwd" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(getPageSpy).not.toHaveBeenCalled();
  });

  it("enforces network allowlist hosts", async () => {
    const page = createStubPage("https://example.com/home");
    const { manager } = createStubManager(page);
    const server = new BrowserToolServer({ manager });
    const allowlistSecurity = {
      ...SECURITY_PRESETS.balanced,
      sandbox: {
        ...SECURITY_PRESETS.balanced.sandbox,
        networkAccess: "allowlist" as const,
        allowedHosts: ["example.com"],
      },
      permissions: {
        ...SECURITY_PRESETS.balanced.permissions,
        network: "allowlist" as const,
      },
    };
    const context = createContext(allowlistSecurity);

    const allowed = await server.callTool(
      { name: "navigate", arguments: { url: "https://sub.example.com/page" } },
      context
    );
    expect(allowed.success).toBe(true);

    const blocked = await server.callTool(
      { name: "navigate", arguments: { url: "https://evil.com" } },
      context
    );
    expect(blocked.success).toBe(false);
    expect(blocked.error?.code).toBe("PERMISSION_DENIED");
  });

  it("requires allowlist entries when allowlist mode is enabled", async () => {
    const page = createStubPage();
    const { manager, getPageSpy } = createStubManager(page);
    const server = new BrowserToolServer({ manager });
    const allowlistSecurity = {
      ...SECURITY_PRESETS.balanced,
      sandbox: {
        ...SECURITY_PRESETS.balanced.sandbox,
        networkAccess: "allowlist" as const,
      },
      permissions: {
        ...SECURITY_PRESETS.balanced.permissions,
        network: "allowlist" as const,
      },
    };
    const context = createContext(allowlistSecurity);

    const result = await server.callTool(
      { name: "navigate", arguments: { url: "https://example.com" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
    expect(getPageSpy).not.toHaveBeenCalled();
  });

  it("skips snapshot retrieval when selector is provided", async () => {
    const page = createStubPage();
    const { manager, snapshotSpy } = createStubManager(page);
    const server = new BrowserToolServer({ manager });
    const context = createContext(SECURITY_PRESETS.power);

    const result = await server.callTool(
      {
        name: "interact",
        arguments: { action: "click", selector: "#submit" },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });
});
