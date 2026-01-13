/**
 * Cowork Session Manager Tests
 */

import { describe, expect, it } from "vitest";
import { CoworkSessionManager } from "../cowork/session";

describe("CoworkSessionManager", () => {
  it("creates sessions with expected path layout", () => {
    const manager = new CoworkSessionManager({ baseSessionDir: "/sessions" });

    const record = manager.createSession({
      sessionId: "test-session",
      userId: "user-1",
      deviceId: "device-1",
      grants: [],
      connectors: [],
    });

    expect(record.session.sessionId).toBe("test-session");
    expect(record.paths.sessionRoot).toBe("/sessions/test-session");
    expect(record.paths.mountRoot).toBe("/sessions/test-session/mnt");
    expect(record.paths.outputsRoot).toBe("/sessions/test-session/mnt/outputs");
    expect(record.paths.uploadsRoot).toBe("/sessions/test-session/mnt/uploads");
  });

  it("ends sessions and removes records", () => {
    const manager = new CoworkSessionManager();
    const record = manager.createSession({
      sessionId: "cleanup",
      userId: "user-1",
      deviceId: "device-1",
      grants: [],
      connectors: [],
    });

    expect(manager.getSession(record.session.sessionId)).toBeDefined();
    expect(manager.endSession(record.session.sessionId)).toBe(true);
    expect(manager.getSession(record.session.sessionId)).toBeUndefined();
  });
});
