import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileMcpOAuthTokenStore } from "../oauth";

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
});
