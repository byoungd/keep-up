/**
 * Cowork File Tool Enforcement Tests
 */

import { FileToolServer, type IFileSystem } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import { DEFAULT_COWORK_POLICY } from "../cowork/defaultPolicy";
import { CoworkPolicyEngine } from "../cowork/policy";
import type { CoworkSession } from "../cowork/types";
import { SECURITY_PRESETS } from "../types";

class StubFileSystem implements IFileSystem {
  async readFile(): Promise<string> {
    return "ok";
  }

  async writeFile(): Promise<void> {
    return undefined;
  }

  async mkdir(): Promise<void> {
    return undefined;
  }

  async readdir(): Promise<string[]> {
    return [];
  }

  async stat(): Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: Date }> {
    return { isDirectory: false, isFile: true, size: 2, mtime: new Date() };
  }

  async unlink(): Promise<void> {
    return undefined;
  }

  async realpath(targetPath: string): Promise<string> {
    return targetPath;
  }

  exists(): boolean {
    return true;
  }
}

describe("FileToolServer Cowork enforcement", () => {
  const session: CoworkSession = {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    grants: [
      {
        id: "grant-1",
        rootPath: "/workspace",
        allowWrite: true,
        allowDelete: true,
        allowCreate: true,
        outputRoots: ["/workspace/output"],
      },
    ],
    connectors: [],
    createdAt: Date.now(),
  };

  it("allows reads within grants", async () => {
    const server = new FileToolServer({ fileSystem: new StubFileSystem() });
    const policyEngine = new CoworkPolicyEngine(DEFAULT_COWORK_POLICY);

    const result = await server.callTool(
      { name: "read", arguments: { path: "/workspace/doc.txt" } },
      {
        security: { ...SECURITY_PRESETS.balanced },
        cowork: { session, policyEngine },
      }
    );

    expect(result.success).toBe(true);
  });

  it("denies reads outside grants", async () => {
    const server = new FileToolServer({ fileSystem: new StubFileSystem() });
    const policyEngine = new CoworkPolicyEngine(DEFAULT_COWORK_POLICY);

    const result = await server.callTool(
      { name: "read", arguments: { path: "/secret/hidden.txt" } },
      {
        security: { ...SECURITY_PRESETS.balanced },
        cowork: { session, policyEngine },
      }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });
});
