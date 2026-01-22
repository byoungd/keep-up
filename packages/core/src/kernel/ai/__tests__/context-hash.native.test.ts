import { getNativeAiContextHash } from "@ku0/ai-context-hash-rs";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { describe, expect, it } from "vitest";
import {
  computeOptimisticHash,
  computeOptimisticHashBatch,
  verifyOptimisticHash,
} from "../context.js";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeAiContextHash();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;
const batchTestFn = native?.sha256HexBatch ? it : it.skip;

const fixtures = ["Hello world", "  trim   and   collapse \n whitespace  ", "Multi\tspace\ttext"];

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

describe("AI context hash native parity", () => {
  testFn("matches JS optimistic hashes", async () => {
    if (!native) {
      throw new Error("Native AI context hash binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    try {
      for (const [index, text] of fixtures.entries()) {
        const expected = await computeOptimisticHash(text);
        const actual = native.sha256Hex(normalizeText(text));

        assertParity(expected, actual, { label: `context hash parity ${index}` });
      }
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  testFn("verifyOptimisticHash uses native hash output", async () => {
    if (!native) {
      throw new Error("Native AI context hash binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    let expected: string;
    try {
      expected = await computeOptimisticHash(fixtures[0]);
    } finally {
      nativeFlagStore.clearOverrides();
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", true);

    try {
      await expect(verifyOptimisticHash(fixtures[0], expected)).resolves.toBe(true);
      await expect(verifyOptimisticHash(`${fixtures[0]}!`, expected)).resolves.toBe(false);
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  batchTestFn("matches JS batch hashes", async () => {
    if (!native?.sha256HexBatch) {
      throw new Error("Native AI context hash batch binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    try {
      const expected = await computeOptimisticHashBatch(fixtures);
      const actual = native.sha256HexBatch(fixtures.map((text) => normalizeText(text)));

      assertParity(expected, actual, { label: "context hash batch parity" });
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });
});
