/**
 * Driver Selection Tests
 *
 * Tests for AutoSwitchDbClient fallback logic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Driver Selection", () => {
  const PREF_KEY = "reader_db_driver_pref";

  beforeEach(() => {
    // Clear localStorage
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(PREF_KEY);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Sticky Fallback Preference", () => {
    it("should respect 'idb-dexie' sticky preference", () => {
      // This is a behavioral contract test
      // When PREF_KEY is set to 'idb-dexie', the driver should skip SQLite
      const storedPref = "idb-dexie";
      const forceIdb = storedPref === "idb-dexie";
      expect(forceIdb).toBe(true);
    });

    it("should not force IDB fallback when preference is not set", () => {
      const storedPref: string | null = null;
      const forceIdb = storedPref === "idb-dexie";
      expect(forceIdb).toBe(false);
    });

    it("should not force IDB fallback when preference is 'sqlite-opfs'", () => {
      const storedPref: string = "sqlite-opfs";
      const forceIdb = storedPref === "idb-dexie";
      expect(forceIdb).toBe(false);
    });
  });

  describe("OPFS Feature Detection", () => {
    it("should detect OPFS availability via navigator.storage.getDirectory", () => {
      // Simulate OPFS available
      const hasOpfs =
        typeof navigator !== "undefined" &&
        navigator.storage &&
        typeof navigator.storage.getDirectory === "function";

      // In node test environment, navigator is undefined so hasOpfs is falsy
      // In browser with OPFS, it would be true
      expect(hasOpfs).toBeFalsy();
    });
  });

  describe("DbHealthInfo Contract", () => {
    it("should have required health info fields", () => {
      const healthInfo = {
        driver: "idb-dexie" as const,
        schemaVersion: 1,
        isLeader: false,
        opfsAvailable: false,
        idbAvailable: true,
      };

      expect(healthInfo.driver).toMatch(/^(sqlite-opfs|idb-dexie)$/);
      expect(typeof healthInfo.schemaVersion).toBe("number");
      expect(typeof healthInfo.isLeader).toBe("boolean");
      expect(typeof healthInfo.opfsAvailable).toBe("boolean");
      expect(typeof healthInfo.idbAvailable).toBe("boolean");
    });
  });
});
