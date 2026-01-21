import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { getNativePolicyHash } from "@ku0/policy-hash-rs";
import { describe, it } from "vitest";
import { computePolicyManifestHash } from "../hash.js";
import { stableStringify } from "../stableStringify.js";
import { DEFAULT_POLICY_MANIFEST, type PolicyManifestV09 } from "../types.js";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativePolicyHash();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;

function normalizeManifestForHash(manifest: PolicyManifestV09): PolicyManifestV09 {
  return JSON.parse(JSON.stringify(manifest)) as PolicyManifestV09;
}

describe("Policy hash native parity", () => {
  testFn("matches JS policy manifest hash", async () => {
    if (!native) {
      throw new Error("Native policy hash binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    try {
      const manifest = normalizeManifestForHash(DEFAULT_POLICY_MANIFEST);
      const expected = await computePolicyManifestHash(manifest);
      const serialized = stableStringify(manifest);
      const actual = native.sha256Hex(serialized);

      assertParity(expected, actual, { label: "policy hash parity" });
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });
});
