import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SANITIZATION_POLICY, createSanitizer } from "../sanitizer.js";
import type { AISanitizationPolicyV1 } from "../types.js";

describe("AI Sanitizer Limits", () => {
  const sanitizer = createSanitizer();
  const minimalPolicy: AISanitizationPolicyV1 = {
    ...DEFAULT_AI_SANITIZATION_POLICY,
    limits: {
      max_payload_bytes: 100,
      max_nesting_depth: 3,
      max_attribute_count: 2,
    },
  };

  it("should respect max_payload_bytes", () => {
    const hugeHtml = "a".repeat(101);
    const result = sanitizer.sanitize({ html: hugeHtml }, minimalPolicy);
    expect(result.errors).toContainEqual(expect.objectContaining({ kind: "payload_too_large" }));
  });

  it("should respect max_nesting_depth", () => {
    // Depth 4
    const deepHtml = "<span><span><span><span>text</span></span></span></span>";
    const result = sanitizer.sanitize({ html: deepHtml }, minimalPolicy);

    // Check for limit_exceeded error
    const LimitError = result.errors?.find(
      (e) => e.kind === "limit_exceeded" && e.detail.includes("Nesting")
    );
    expect(LimitError).toBeDefined();
  });

  it("should respect max_attribute_count", () => {
    // 3 attributes
    const attrsHtml = '<a href="#" title="t" rel="nofollow">link</a>';
    const result = sanitizer.sanitize({ html: attrsHtml }, minimalPolicy);

    const LimitError = result.errors?.find(
      (e) => e.kind === "limit_exceeded" && e.detail.includes("Attribute")
    );
    expect(LimitError).toBeDefined();
  });

  it("should allow safe payloads", () => {
    const safeHtml = '<span><a href="#" title="safe">link</a></span>';
    const result = sanitizer.sanitize({ html: safeHtml }, minimalPolicy);
    expect(result.errors).toBeUndefined();
    expect(result.sanitized_html).toContain("link");
  });
});
