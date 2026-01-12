/**
 * LFCC v0.9 RC - Anchor Interop Tests
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/22_Anchor_Upgrade_Path.md
 *
 * Tests interoperability between core and bridge anchor encoding.
 */

import { describe, expect, it } from "vitest";
import {
  type AnchorData,
  CODEC_VERSION,
  computeCRC32,
  decodeAnchorV2,
  encodeAnchorV2,
  verifyCRC32,
} from "../anchors/codec";

describe("Unified Anchor Codec", () => {
  describe("encodeAnchorV2 / decodeAnchorV2", () => {
    it("should round-trip anchor data correctly", () => {
      const data: AnchorData = {
        blockId: "block-123-abc",
        offset: 42,
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);
      const decoded = decodeAnchorV2(encoded.bytes);

      expect(decoded).toEqual(data);
    });

    it("should round-trip via base64 string", () => {
      const data: AnchorData = {
        blockId: "test-block-uuid-like-id",
        offset: 1000,
        bias: "before",
      };

      const encoded = encodeAnchorV2(data);
      const decoded = decodeAnchorV2(encoded.base64);

      expect(decoded).toEqual(data);
    });

    it("should handle Unicode block IDs", () => {
      const data: AnchorData = {
        blockId: "block-中文-🎉",
        offset: 0,
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);
      const decoded = decodeAnchorV2(encoded.bytes);

      expect(decoded).toEqual(data);
    });

    it("should handle large offsets", () => {
      const data: AnchorData = {
        blockId: "block-1",
        offset: 2147483647, // Max 32-bit signed int
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);
      const decoded = decodeAnchorV2(encoded.bytes);

      expect(decoded).toEqual(data);
    });

    it("should handle empty block ID", () => {
      const data: AnchorData = {
        blockId: "",
        offset: 5,
        bias: "before",
      };

      const encoded = encodeAnchorV2(data);
      const decoded = decodeAnchorV2(encoded.bytes);

      expect(decoded).toEqual(data);
    });
  });

  describe("Checksum Validation", () => {
    it("should reject corrupted bytes", () => {
      const data: AnchorData = {
        blockId: "block-1",
        offset: 10,
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);

      // Corrupt a byte in the middle
      const corrupted = new Uint8Array(encoded.bytes);
      corrupted[5] = (corrupted[5] ?? 0) ^ 0xff;

      const decoded = decodeAnchorV2(corrupted);
      expect(decoded).toBeNull();
    });

    it("should reject truncated data", () => {
      const data: AnchorData = {
        blockId: "block-1",
        offset: 10,
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);
      const truncated = encoded.bytes.slice(0, encoded.bytes.length - 2);

      const decoded = decodeAnchorV2(truncated);
      expect(decoded).toBeNull();
    });

    it("should reject invalid version", () => {
      const data: AnchorData = {
        blockId: "block-1",
        offset: 10,
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);
      const invalidVersion = new Uint8Array(encoded.bytes);
      invalidVersion[0] = 99; // Invalid version

      const decoded = decodeAnchorV2(invalidVersion);
      expect(decoded).toBeNull();
    });
  });

  describe("CRC32 Functions", () => {
    it("should compute consistent CRC32", () => {
      const data = new TextEncoder().encode("Hello, World!");
      const crc1 = computeCRC32(data);
      const crc2 = computeCRC32(data);

      expect(crc1).toEqual(crc2);
    });

    it("should verify correct checksum", () => {
      const data = new TextEncoder().encode("Test data");
      const checksum = computeCRC32(data);

      expect(verifyCRC32(data, checksum)).toBe(true);
    });

    it("should reject incorrect checksum", () => {
      const data = new TextEncoder().encode("Test data");
      const wrongChecksum = new Uint8Array([0, 0, 0, 0]);

      expect(verifyCRC32(data, wrongChecksum)).toBe(false);
    });
  });

  describe("Version Identification", () => {
    it("should encode with current version", () => {
      const data: AnchorData = {
        blockId: "block-1",
        offset: 0,
        bias: "after",
      };

      const encoded = encodeAnchorV2(data);
      expect(encoded.bytes[0]).toBe(CODEC_VERSION);
    });
  });

  describe("Legacy Core Format (Adler32 JSON)", () => {
    it("should decode legacy Adler32 JSON format", () => {
      // Manually construct legacy format
      const blockId = "legacy-block";
      const offset = 5;
      const bias = "after";

      // Compute Adler32 checksum (same as legacy core)
      const checkInput = `${blockId}|${offset}|${bias}`;
      let a = 1;
      let b = 0;
      const MOD = 65521;
      for (let i = 0; i < checkInput.length; i++) {
        a = (a + checkInput.charCodeAt(i)) % MOD;
        b = (b + a) % MOD;
      }
      const checksum = ((b << 16) | a).toString(16);

      const payload = { blockId, offset, bias, c: checksum };
      const json = JSON.stringify(payload);
      const base64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      // Should decode legacy format
      const decoded = decodeAnchorV2(base64);
      expect(decoded).toEqual({ blockId, offset, bias });
    });
  });

  describe("Legacy Plain Format (base64 blockId:offset)", () => {
    it("should decode base64 blockId:offset anchors", () => {
      const blockId = "legacy-block";
      const offset = 12;
      const payload = `${blockId}:${offset}`;
      const base64 = Buffer.from(payload, "utf-8").toString("base64");

      const decoded = decodeAnchorV2(base64);
      expect(decoded).toEqual({ blockId, offset, bias: "after" });
    });
  });
});
