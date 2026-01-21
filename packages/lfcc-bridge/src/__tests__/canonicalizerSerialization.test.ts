import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { describe, expect, it } from "vitest";
import { type CanonNode, serializeCanonNode } from "../security/canonicalizer";

describe("canonicalizer serialization", () => {
  const fixture: CanonNode = {
    id: 0,
    type: "doc",
    attrs: { z: 1, a: "alpha" },
    children: [
      {
        id: 1,
        type: "text",
        attrs: { order: 2, lang: "en" },
        text: "Hello",
        marks: [{ type: "link", attrs: { title: "T", href: "https://x" } }],
      },
    ],
  };

  const expected =
    '{"attrs":{"a":"alpha","z":1},"children":[{"attrs":{"lang":"en","order":2},"id":1,"marks":[{"attrs":{"href":"https://x","title":"T"},"type":"link"}],"text":"Hello","type":"text"}],"id":0,"type":"doc"}';

  it("produces stable checksum input", () => {
    expect(serializeCanonNode(fixture)).toBe(expected);
  });

  it("falls back to JS serialization when native is disabled", () => {
    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    try {
      expect(serializeCanonNode(fixture)).toBe(expected);
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });
});
