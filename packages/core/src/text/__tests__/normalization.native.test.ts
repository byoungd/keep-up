import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { getNativeTextNormalization } from "@ku0/text-normalization-rs";
import { describe, it } from "vitest";
import { canonicalizeText, computeCanonicalHash } from "../normalization.js";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeTextNormalization();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;

const fixtures = ["  Alpha  \n\n  \nBeta\n\nGamma  ", "Single line", "  Lead\n\nTrail  "];

describe("Text normalization native parity", () => {
  testFn("matches JS canonicalization", () => {
    if (!native) {
      throw new Error("Native text normalization binding unavailable.");
    }

    for (const [index, raw] of fixtures.entries()) {
      nativeFlagStore.setOverride("native_accelerators_enabled", false);
      let expected: ReturnType<typeof canonicalizeText>;
      try {
        expected = canonicalizeText(raw);
      } finally {
        nativeFlagStore.clearOverrides();
      }

      nativeFlagStore.setOverride("native_accelerators_enabled", true);
      let actual: ReturnType<typeof canonicalizeText>;
      try {
        actual = canonicalizeText(raw);
      } finally {
        nativeFlagStore.clearOverrides();
      }

      assertParity(expected, actual, { label: `canonicalizeText parity ${index}` });
    }
  });

  testFn("matches JS canonical hashes", () => {
    if (!native) {
      throw new Error("Native text normalization binding unavailable.");
    }

    for (const [index, raw] of fixtures.entries()) {
      nativeFlagStore.setOverride("native_accelerators_enabled", false);
      let blocks: { text: string }[] = [];
      let expected: ReturnType<typeof computeCanonicalHash>;
      try {
        const canonical = canonicalizeText(raw);
        blocks = canonical.blocks.map((text) => ({ text }));
        expected = computeCanonicalHash(blocks);
      } finally {
        nativeFlagStore.clearOverrides();
      }

      nativeFlagStore.setOverride("native_accelerators_enabled", true);
      let actual: ReturnType<typeof computeCanonicalHash>;
      try {
        actual = computeCanonicalHash(blocks);
      } finally {
        nativeFlagStore.clearOverrides();
      }

      assertParity(expected, actual, { label: `computeCanonicalHash parity ${index}` });
    }
  });
});
