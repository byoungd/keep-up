import { getNativeAnchorCodec } from "@ku0/anchor-codec-rs";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { describe, expect, it } from "vitest";
import type { AnchorData } from "../anchors/codec.js";
import { computeCRC32, decodeAnchorV2, encodeAnchorV2 } from "../anchors/codec.js";

const TAG_LENGTH = 16;

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeAnchorCodec();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;

const fixtures: AnchorData[] = [
  { blockId: "block-a", offset: 0, bias: "after" },
  { blockId: "block-b", offset: 42, bias: "before" },
  { blockId: "block-c", offset: 4096, bias: "after" },
];

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("Anchor codec native parity", () => {
  testFn("matches CRC32 outputs", () => {
    if (!native) {
      throw new Error("Native anchor codec binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    const payloads = [
      new Uint8Array([0, 1, 2, 3, 4, 5]),
      new Uint8Array([255, 254, 253, 1, 0]),
      new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
    ];

    try {
      for (const [index, data] of payloads.entries()) {
        const expected = computeCRC32(data);
        const actual = native.crc32(Buffer.from(data));
        assertParity(Array.from(expected), Array.from(actual), {
          label: `crc32 parity ${index}`,
        });
      }
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  testFn("matches HMAC tag generation", () => {
    if (!native) {
      throw new Error("Native anchor codec binding unavailable.");
    }

    const key = new TextEncoder().encode("lfcc-anchor-hmac-key");

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    try {
      for (const [index, fixture] of fixtures.entries()) {
        const encoded = encodeAnchorV2(fixture);
        const tag = encoded.bytes.slice(encoded.bytes.length - TAG_LENGTH);
        const data = encoded.bytes.slice(0, encoded.bytes.length - TAG_LENGTH);
        const expected = native
          .hmacSha256(Buffer.from(key), Buffer.from(data))
          .slice(0, TAG_LENGTH);

        assertParity(Array.from(tag), Array.from(expected), {
          label: `hmac parity ${index}`,
        });
      }
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  testFn("matches Adler32 legacy checksums", () => {
    if (!native) {
      throw new Error("Native anchor codec binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    try {
      for (const [index, fixture] of fixtures.entries()) {
        const checkInput = `${fixture.blockId}|${fixture.offset}|${fixture.bias}`;
        const checksum = native.adler32(checkInput);
        const payload = {
          c: checksum,
          blockId: fixture.blockId,
          offset: fixture.offset,
          bias: fixture.bias,
        };
        const encoded = toBase64Url(JSON.stringify(payload));
        const decoded = decodeAnchorV2(encoded);

        expect(decoded, `adler32 decode ${index}`).toEqual(fixture);
      }
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });
});
