/**
 * LFCC v0.9 RC - Canonicalizer Tests
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md
 */

import { describe, expect, it } from "vitest";
import {
  type CanonBlock,
  type CanonInputNode,
  type CanonText,
  canonicalizeDocument,
  isCanonBlock,
  isCanonText,
  stableStringifyCanon,
} from "../canonicalizer";

describe("Canonicalizer", () => {
  describe("canonicalizeDocument", () => {
    it("should canonicalize a simple paragraph", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [{ kind: "text", text: "Hello world" }],
      };

      const result = canonicalizeDocument({ root: input });

      expect(result.root).toMatchObject({
        type: "paragraph",
        children: [{ text: "Hello world", marks: [], is_leaf: true }],
      });
    });

    it("should normalize mark nesting order", () => {
      // <b><i>text</i></b> and <i><b>text</b></i> should produce same output
      const input1: CanonInputNode = {
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
      };

      const input2: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [
          {
            kind: "element",
            tag: "i",
            attrs: {},
            children: [
              {
                kind: "element",
                tag: "b",
                attrs: {},
                children: [{ kind: "text", text: "styled" }],
              },
            ],
          },
        ],
      };

      const result1 = canonicalizeDocument({ root: input1 });
      const result2 = canonicalizeDocument({ root: input2 });

      // Both should have same marks in same order
      expect(stableStringifyCanon(result1.root)).toBe(stableStringifyCanon(result2.root));

      const textNode = (result1.root as CanonBlock).children[0] as CanonText;
      expect(textNode.marks).toEqual(["bold", "italic"]);
    });

    it("should handle nested list inside table cell", () => {
      const input: CanonInputNode = {
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
                      {
                        kind: "element",
                        tag: "li",
                        attrs: {},
                        children: [{ kind: "text", text: "Item 2" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = canonicalizeDocument({ root: input });
      const root = result.root as CanonBlock;

      expect(root.type).toBe("table");
      expect(root.children).toHaveLength(1);

      const row = root.children[0] as CanonBlock;
      expect(row.type).toBe("table_row");

      const cell = row.children[0] as CanonBlock;
      expect(cell.type).toBe("table_cell");

      // Cell should contain the list
      const list = cell.children[0] as CanonBlock;
      expect(list.type).toBe("list");
      expect(list.children).toHaveLength(2);
    });

    it("should normalize whitespace", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [{ kind: "text", text: "Hello   world\r\n  test" }],
      };

      const result = canonicalizeDocument({ root: input });
      const textNode = (result.root as CanonBlock).children[0] as CanonText;

      expect(textNode.text).toBe("Hello world\n test");
      expect(result.diagnostics.some((d) => d.kind === "normalized_whitespace")).toBe(true);
    });

    it("should drop empty nodes when policy requires", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [
          { kind: "text", text: "   " },
          { kind: "element", tag: "b", attrs: {}, children: [] },
        ],
      };

      const result = canonicalizeDocument({ root: input });

      expect(result.diagnostics.some((d) => d.kind === "dropped_empty_node")).toBe(true);
    });

    it("should preserve link href in attrs", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [
          {
            kind: "element",
            tag: "a",
            attrs: { href: "https://example.com" },
            children: [{ kind: "text", text: "Click here" }],
          },
        ],
      };

      const result = canonicalizeDocument({ root: input });
      const textNode = (result.root as CanonBlock).children[0] as CanonText;

      expect(textNode.marks).toContain("link");
      expect(textNode.attrs?.href).toBe("https://example.com");
    });

    it("should merge adjacent text nodes with same marks", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [
          {
            kind: "element",
            tag: "b",
            attrs: {},
            children: [
              { kind: "text", text: "Hello " },
              { kind: "text", text: "world" },
            ],
          },
        ],
      };

      const result = canonicalizeDocument({ root: input });
      const children = (result.root as CanonBlock).children;

      // Should be merged into single text node
      expect(children).toHaveLength(1);
      expect((children[0] as CanonText).text).toBe("Hello world");
    });
  });

  describe("stableStringifyCanon", () => {
    it("should produce deterministic output", () => {
      const node: CanonBlock = {
        id: "r/0",
        type: "paragraph",
        attrs: { z: "last", a: "first" },
        children: [{ text: "test", marks: ["bold"], is_leaf: true }],
      };

      const str1 = stableStringifyCanon(node);
      const str2 = stableStringifyCanon(node);

      expect(str1).toBe(str2);
      // Keys should be sorted
      expect(str1).toContain('"a":"first"');
      expect(str1.indexOf('"a"')).toBeLessThan(str1.indexOf('"z"'));
    });
  });

  describe("type guards", () => {
    it("should correctly identify CanonText", () => {
      const text: CanonText = { text: "hello", marks: [], is_leaf: true };
      const block: CanonBlock = { id: "1", type: "p", attrs: {}, children: [] };

      expect(isCanonText(text)).toBe(true);
      expect(isCanonText(block)).toBe(false);
    });

    it("should correctly identify CanonBlock", () => {
      const text: CanonText = { text: "hello", marks: [], is_leaf: true };
      const block: CanonBlock = { id: "1", type: "p", attrs: {}, children: [] };

      expect(isCanonBlock(block)).toBe(true);
      expect(isCanonBlock(text)).toBe(false);
    });
  });
});
