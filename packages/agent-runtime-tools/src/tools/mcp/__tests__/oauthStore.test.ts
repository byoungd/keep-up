import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMcpOAuthClientProvider,
  FileMcpOAuthTokenStore,
  resolveMcpOAuthTokenStore,
} from "../oauth";

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

describe("oauth token store", () => {
  it("persists encrypted tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-oauth-"));
    const filePath = join(dir, "tokens.json");
    const key = randomBytes(32).toString("base64");
    const store = new FileMcpOAuthTokenStore({ filePath, encryptionKey: key });

    const tokens = {
      access_token: "test-access",
      refresh_token: "test-refresh",
      scope: "read write",
    };

    await store.saveTokens(tokens);
    const raw = await readFile(filePath, "utf-8");
    expect(raw).not.toContain("access_token");
    expect(raw).not.toContain("test-access");

    const loaded = await store.getTokens();
    expect(loaded).toEqual(tokens);
  });

  it("clears stored tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-oauth-"));
    const filePath = join(dir, "tokens.json");
    const key = randomBytes(32).toString("base64");
    const store = new FileMcpOAuthTokenStore({ filePath, encryptionKey: key });

    await store.saveTokens({ access_token: "test" });
    expect(await fileExists(filePath)).toBe(true);

    await store.clear();
    expect(await fileExists(filePath)).toBe(false);
    expect(await store.getTokens()).toBeUndefined();
  });

  it("stores multiple token entries in one file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-oauth-"));
    const filePath = join(dir, "tokens.json");
    const key = randomBytes(32).toString("base64");
    const accountA = new FileMcpOAuthTokenStore({
      filePath,
      encryptionKey: key,
      accountId: "acct-a",
    });
    const accountB = new FileMcpOAuthTokenStore({
      filePath,
      encryptionKey: key,
      accountId: "acct-b",
      workspaceId: "ws-1",
    });

    await accountA.saveTokens({ access_token: "token-a" });
    await accountB.saveTokens({ access_token: "token-b" });

    expect(await accountA.getTokens()).toEqual({ access_token: "token-a" });
    expect(await accountB.getTokens()).toEqual({ access_token: "token-b" });

    await accountA.clear();
    expect(await accountA.getTokens()).toBeUndefined();
    expect(await accountB.getTokens()).toEqual({ access_token: "token-b" });
  });

  it("resolves token store config into provider", async () => {
    const provider = createMcpOAuthClientProvider(
      {
        clientId: "client-test",
        grantType: "client_credentials",
      },
      { type: "memory" }
    );

    await provider.saveTokens({ access_token: "test-access" });
    expect(await provider.tokens()).toEqual({ access_token: "test-access" });

    const store = resolveMcpOAuthTokenStore({ type: "memory" });
    await store?.saveTokens({ access_token: "store-access" });
    expect(await store?.getTokens()).toEqual({ access_token: "store-access" });
  });
});
