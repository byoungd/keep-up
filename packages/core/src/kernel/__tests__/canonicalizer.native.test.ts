import { getNativeCanonicalizer } from "@ku0/canonicalizer-rs";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { describe, it } from "vitest";
import { canonicalizeDocument } from "../canonicalizer/canonicalize.js";
import type { CanonInputNode } from "../canonicalizer/types.js";
import { DEFAULT_CANONICALIZER_POLICY } from "../canonicalizer/types.js";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeCanonicalizer();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;

const fixtures: CanonInputNode[] = [
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [{ kind: "text", text: "Hello world" }],
  },
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [
      {
        kind: "element",
        tag: "b",
        attrs: {},
        children: [
          {
            kind: "element",
            tag: "i",
            attrs: {},
            children: [{ kind: "text", text: "styled" }],
          },
        ],
      },
    ],
  },
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [{ kind: "text", text: "Hello   world\r\n  test" }],
  },
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [
      {
        kind: "element",
        tag: "a",
        attrs: { href: "https://example.com" },
        children: [{ kind: "text", text: "Click" }],
      },
    ],
  },
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [
      {
        kind: "element",
        tag: "a",
        attrs: { href: "javascript:alert('xss')" },
        children: [{ kind: "text", text: "Bad" }],
      },
    ],
  },
  {
    kind: "element",
    tag: "table",
    attrs: {},
    children: [
      {
        kind: "element",
        tag: "tr",
        attrs: {},
        children: [
          {
            kind: "element",
            tag: "td",
            attrs: {},
            children: [
              {
                kind: "element",
                tag: "ul",
                attrs: {},
                children: [
                  {
                    kind: "element",
                    tag: "li",
                    attrs: {},
                    children: [{ kind: "text", text: "Item 1" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [
      {
        kind: "element",
        tag: "span",
        attrs: {},
        children: [{ kind: "text", text: "unknown mark" }],
      },
    ],
  },
  {
    kind: "element",
    tag: "p",
    attrs: {},
    children: [{ kind: "text", text: "   " }],
  },
];

describe("Canonicalizer native parity", () => {
  testFn("matches TS canonicalizer outputs", () => {
    nativeFlagStore.setOverride("native_accelerators_enabled", false);

    try {
      for (const [index, fixture] of fixtures.entries()) {
        const expected = canonicalizeDocument({ root: fixture }, DEFAULT_CANONICALIZER_POLICY);
        const actual = native?.canonicalizeDocument(
          { root: fixture },
          DEFAULT_CANONICALIZER_POLICY
        );

        if (!actual) {
          throw new Error("Native canonicalizer binding unavailable.");
        }

        assertParity(expected, actual, { label: `canonicalizer parity ${index}` });
      }
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });
});
