import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUserRoutes } from "../routes/user";

function withEnv(values: Record<string, string | undefined>) {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    snapshot[key] = process.env[key];
    const next = values[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  return () => {
    for (const key of Object.keys(values)) {
      const restore = snapshot[key];
      if (restore === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = restore;
      }
    }
  };
}

describe("User routes", () => {
  let app: Hono;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    app = createUserRoutes();
    restoreEnv?.();
    restoreEnv = withEnv({
      COWORK_USER_ID: undefined,
      COWORK_USER_EMAIL: undefined,
      COWORK_USER_NAME: undefined,
      COWORK_USER_FULL_NAME: undefined,
      COWORK_USER_IMAGE: undefined,
      COWORK_USER_PERMISSIONS: undefined,
    });
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
  });

  it("returns null when no user context is available", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; user: unknown };
    expect(data.ok).toBe(true);
    expect(data.user).toBeNull();
  });

  it("uses headers when provided", async () => {
    const res = await app.request("/me", {
      headers: {
        "x-cowork-user-id": "user-1",
        "x-cowork-user-email": "user@example.com",
        "x-cowork-user-name": "Test User",
        "x-cowork-user-permissions": "read, write",
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      user: { id: string; email?: string; fullName?: string; permissions?: string[] };
    };
    expect(data.ok).toBe(true);
    expect(data.user.id).toBe("user-1");
    expect(data.user.email).toBe("user@example.com");
    expect(data.user.fullName).toBe("Test User");
    expect(data.user.permissions).toEqual(["read", "write"]);
  });

  it("falls back to environment settings", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      COWORK_USER_ID: "env-user",
      COWORK_USER_EMAIL: "env@example.com",
      COWORK_USER_FULL_NAME: "Env User",
      COWORK_USER_PERMISSIONS: "admin",
    });

    const res = await app.request("/me");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; user: { id: string; email?: string } };
    expect(data.user.id).toBe("env-user");
    expect(data.user.email).toBe("env@example.com");
  });
});
