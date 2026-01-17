/**
 * Protocol Version Guard Tests
 */

import { describe, expect, it } from "vitest";
import {
  createVersionMismatchError,
  DEPRECATED_VERSIONS,
  isVersionDeprecated,
  isVersionSupported,
  SUPPORTED_PROTOCOL_VERSIONS,
  validateProtocolVersion,
} from "../protocol/versionGuard";

describe("versionGuard", () => {
  describe("isVersionSupported", () => {
    it("should return true for supported versions", () => {
      for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
        expect(isVersionSupported(version)).toBe(true);
      }
    });

    it("should return false for unsupported versions", () => {
      expect(isVersionSupported("0.5.0")).toBe(false);
      expect(isVersionSupported("2.0.0")).toBe(false);
      expect(isVersionSupported("invalid")).toBe(false);
    });
  });

  describe("isVersionDeprecated", () => {
    it("should return true for deprecated versions", () => {
      for (const version of DEPRECATED_VERSIONS) {
        expect(isVersionDeprecated(version)).toBe(true);
      }
    });

    it("should return false for non-deprecated versions", () => {
      expect(isVersionDeprecated("1.0.0")).toBe(false);
      expect(isVersionDeprecated("2.0.0")).toBe(false);
    });
  });

  describe("validateProtocolVersion", () => {
    it("should return null for valid version", () => {
      expect(validateProtocolVersion("1.0.0")).toBeNull();
    });

    it("should return error for deprecated version", () => {
      const error = validateProtocolVersion("0.8.0");
      expect(error).not.toBeNull();
      expect(error).toContain("deprecated");
    });

    it("should return error for unsupported version", () => {
      const error = validateProtocolVersion("999.0.0");
      expect(error).not.toBeNull();
      expect(error).toContain("not supported");
    });
  });

  describe("createVersionMismatchError", () => {
    it("should mention deprecation for deprecated versions", () => {
      const error = createVersionMismatchError("0.9.0-beta");
      expect(error).toContain("deprecated");
      expect(error).toContain("1.0.0");
    });

    it("should list supported versions for unknown versions", () => {
      const error = createVersionMismatchError("unknown");
      expect(error).toContain("not supported");
      expect(error).toContain("1.0.0");
    });
  });
});
