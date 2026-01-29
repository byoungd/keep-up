/**
 * LFCC v0.9 RC — AI Dry-Run Conformance
 * C3: Sanitization and canonicalization must fail closed on blocked content.
 */

import { describe, expect, it } from "vitest";
import {
  createPassThroughValidator,
  createSanitizer,
  DEFAULT_AI_SANITIZATION_POLICY,
  dryRunAIPayload,
} from "../ai/index.js";

const sanitizer = createSanitizer();
const validator = createPassThroughValidator();

describe("AI dry-run conformance (C3)", () => {
  it("rejects blocked tags via sanitization", async () => {
    const result = await dryRunAIPayload(
      { html: "<script>alert('x')</script>" },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Sanitization produced empty payload");
  });

  it("accepts safe HTML and returns canonical output", async () => {
    const result = await dryRunAIPayload(
      { html: "<p>Hello</p>" },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(true);
    expect(result.canon_root).toBeDefined();
  });
});
