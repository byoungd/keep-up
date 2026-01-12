/**
 * LFCC v0.9 RC - Canonical Attribute Enforcement Tests
 * @see docs/product/Audit/enhance/stage2/agent_3_bridge.md
 */

import { describe, expect, it } from "vitest";
import { isValidUrl, processMarkAttributes, validateAndSanitizeHref } from "../attrs";
import { canonicalizeDocument } from "../canonicalize";
import { DEFAULT_CANONICALIZER_POLICY } from "../types";

describe("Canonical Attribute Enforcement", () => {
  describe("isValidUrl()", () => {
    it("should accept http:// URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("http://example.com/path")).toBe(true);
    });

    it("should accept https:// URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://example.com/path")).toBe(true);
    });

    it("should accept mailto: URLs", () => {
      expect(isValidUrl("mailto:test@example.com")).toBe(true);
    });

    it("should reject javascript: URLs", () => {
      expect(isValidUrl("javascript:alert('xss')")).toBe(false);
    });

    it("should reject data: URLs", () => {
      expect(isValidUrl("data:text/html,<script>alert('xss')</script>")).toBe(false);
    });

    it("should reject invalid URLs", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("file:///path")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("validateAndSanitizeHref()", () => {
    it("should return valid href", () => {
      expect(validateAndSanitizeHref("https://example.com")).toBe("https://example.com");
      expect(validateAndSanitizeHref("http://example.com")).toBe("http://example.com");
      expect(validateAndSanitizeHref("mailto:test@example.com")).toBe("mailto:test@example.com");
    });

    it("should return null for invalid href", () => {
      expect(validateAndSanitizeHref("javascript:alert('xss')")).toBe(null);
      expect(validateAndSanitizeHref("data:text/html,<script>")).toBe(null);
      expect(validateAndSanitizeHref("")).toBe(null);
      expect(validateAndSanitizeHref(undefined)).toBe(null);
    });
  });

  describe("processMarkAttributes()", () => {
    it("should allow href for link marks", () => {
      const result = processMarkAttributes("link", { href: "https://example.com" });
      expect(result.href).toBe("https://example.com");
    });

    it("should strip href from non-link marks", () => {
      const result = processMarkAttributes("bold", { href: "https://example.com" });
      expect(result.href).toBeUndefined();
    });

    it("should validate href for link marks", () => {
      const result = processMarkAttributes("link", { href: "javascript:alert('xss')" });
      expect(result.href).toBeUndefined();
    });

    it("should strip all attributes from non-link marks", () => {
      const result = processMarkAttributes("bold", { color: "red", href: "https://example.com" });
      expect(result).toEqual({});
    });
  });

  describe("Canonicalizer Integration", () => {
    it("should strip href from bold mark", () => {
      const input = {
        root: {
          kind: "element",
          tag: "p",
          attrs: {},
          children: [
            {
              kind: "element",
              tag: "b",
              attrs: { href: "https://example.com" },
              children: [{ kind: "text", text: "bold text" }],
            },
          ],
        },
      };

      const result = canonicalizeDocument(input, DEFAULT_CANONICALIZER_POLICY);
      const textNode = result.root.children[0];
      if (textNode && "is_leaf" in textNode && textNode.is_leaf) {
        expect(textNode.attrs).toBeUndefined();
        expect(textNode.marks).toContain("bold");
      }
    });

    it("should keep valid href for link mark", () => {
      const input = {
        root: {
          kind: "element",
          tag: "p",
          attrs: {},
          children: [
            {
              kind: "element",
              tag: "a",
              attrs: { href: "https://example.com" },
              children: [{ kind: "text", text: "link text" }],
            },
          ],
        },
      };

      const result = canonicalizeDocument(input, DEFAULT_CANONICALIZER_POLICY);
      const textNode = result.root.children[0];
      if (textNode && "is_leaf" in textNode && textNode.is_leaf) {
        expect(textNode.attrs?.href).toBe("https://example.com");
        expect(textNode.marks).toContain("link");
      }
    });

    it("should drop invalid href from link mark", () => {
      const input = {
        root: {
          kind: "element",
          tag: "p",
          attrs: {},
          children: [
            {
              kind: "element",
              tag: "a",
              attrs: { href: "javascript:alert('xss')" },
              children: [{ kind: "text", text: "link text" }],
            },
          ],
        },
      };

      const result = canonicalizeDocument(input, DEFAULT_CANONICALIZER_POLICY);
      const textNode = result.root.children[0];
      if (textNode && "is_leaf" in textNode && textNode.is_leaf) {
        expect(textNode.attrs).toBeUndefined();
        expect(result.diagnostics.some((d) => d.kind === "dropped_invalid_href")).toBe(true);
      }
    });

    it("should drop href from non-link mark with diagnostic", () => {
      const input = {
        root: {
          kind: "element",
          tag: "p",
          attrs: {},
          children: [
            {
              kind: "element",
              tag: "b",
              attrs: { href: "https://example.com" },
              children: [{ kind: "text", text: "bold text" }],
            },
          ],
        },
      };

      const result = canonicalizeDocument(input, DEFAULT_CANONICALIZER_POLICY);
      const textNode = result.root.children[0];
      if (textNode && "is_leaf" in textNode && textNode.is_leaf) {
        expect(textNode.attrs).toBeUndefined();
        expect(result.diagnostics.some((d) => d.kind === "dropped_non_link_href")).toBe(true);
      }
    });
  });
});
