import { getNativeAiSanitizer } from "@ku0/ai-sanitizer-rs";
import { assertParity } from "@ku0/native-bindings/testing";
import { describe, it } from "vitest";
import { createFallbackSanitizer } from "../ai/sanitizer.js";
import type { SanitizedPayload } from "../ai/types.js";
import { DEFAULT_AI_SANITIZATION_POLICY } from "../ai/types.js";

const native = getNativeAiSanitizer();
const testFn = native ? it : it.skip;

type Fixture = {
  label: string;
  input: { html?: string; markdown?: string };
};

const fixtures: Fixture[] = [
  { label: "safe-html", input: { html: "<p>Hello <b>world</b></p>" } },
  {
    label: "blocked-tags",
    input: { html: '<p>Hello</p><script>alert("xss")</script><p>World</p>' },
  },
  { label: "unsafe-url", input: { html: '<a href="javascript:alert(1)">Click</a>' } },
  { label: "critical-url", input: { html: '<a href="vbscript:alert(1)">Click</a>' } },
  {
    label: "srcset",
    input: { html: '<img srcset="https://safe.com/1x.png 1x, data:image,evil.jpg 2x">' },
  },
  { label: "markdown-html", input: { markdown: "# Title\n<script>bad</script>\nText" } },
  {
    label: "safe-attrs",
    input: { html: '<a href="https://example.com" rel="nofollow" title="ok">Link</a>' },
  },
];

function normalizePayload(payload: SanitizedPayload) {
  const diagnostics = [...payload.diagnostics]
    .map((diag) => ({
      ...diag,
      severity: diag.severity ?? null,
    }))
    .sort((a, b) =>
      `${a.kind}:${a.detail}:${a.severity ?? ""}`.localeCompare(
        `${b.kind}:${b.detail}:${b.severity ?? ""}`
      )
    );

  const errors = payload.errors
    ? [...payload.errors].sort((a, b) =>
        `${a.kind}:${a.detail}`.localeCompare(`${b.kind}:${b.detail}`)
      )
    : null;

  return {
    sanitized_html: payload.sanitized_html ?? null,
    sanitized_markdown: payload.sanitized_markdown ?? null,
    diagnostics,
    errors,
  };
}

describe("AI sanitizer native parity", () => {
  const fallback = createFallbackSanitizer();

  testFn("matches JS sanitizer output", () => {
    if (!native) {
      throw new Error("Native sanitizer binding unavailable.");
    }

    for (const fixture of fixtures) {
      const expected = fallback.sanitize(fixture.input, DEFAULT_AI_SANITIZATION_POLICY);
      const actual = native.sanitize(fixture.input, DEFAULT_AI_SANITIZATION_POLICY);
      assertParity(expected, actual, {
        label: `ai sanitizer parity ${fixture.label}`,
        normalize: normalizePayload,
      });
    }
  });
});
