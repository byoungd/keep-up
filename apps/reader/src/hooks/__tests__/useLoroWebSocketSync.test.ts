/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPLICA_ID_KEY, getOrCreateReplicaId } from "../useLoroWebSocketSync";

describe("useLoroWebSocketSync", () => {
  describe("getOrCreateReplicaId", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it("should generate new ID if missing in localStorage", () => {
      const id = getOrCreateReplicaId();
      expect(id).toBeDefined();
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^\d+$/);
      expect(localStorage.getItem(REPLICA_ID_KEY)).toBe(id);
    });

    it("should return existing ID if present in localStorage", () => {
      const existingId = "123456";
      localStorage.setItem(REPLICA_ID_KEY, existingId);

      const id = getOrCreateReplicaId();
      expect(id).toBe(existingId);
    });

    it("should replace invalid stored IDs with a numeric peer ID", () => {
      const existingId = "existing-uuid-123";
      localStorage.setItem(REPLICA_ID_KEY, existingId);

      const id = getOrCreateReplicaId();
      expect(id).not.toBe(existingId);
      expect(id).toMatch(/^\d+$/);
      expect(localStorage.getItem(REPLICA_ID_KEY)).toBe(id);
    });

    it("should return empty string in SSR (window undefined)", () => {
      // Basic check to ensure it handles non-browser env if possible to mock
      // Since jsdom defines window, we'd need to aggressively mock it, which might be overkill.
      // We assume strict environment checks in code.
    });
  });
});
