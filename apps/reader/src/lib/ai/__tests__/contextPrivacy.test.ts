import { describe, expect, it } from "vitest";
import {
  buildContextSections,
  composePromptWithContext,
  createContextPayload,
  evaluateConsent,
  redactSensitiveText,
} from "../contextPrivacy";

describe("evaluateConsent", () => {
  it("denies context when global is off", () => {
    const decision = evaluateConsent({
      globalAllow: false,
      disclosureAccepted: false,
    });
    expect(decision.baseAllow).toBe(false);
    expect(decision.allowContext).toBe(false);
    expect(decision.needsDisclosure).toBe(false);
  });

  it("requires disclosure before allowing context", () => {
    const decision = evaluateConsent({
      globalAllow: true,
      disclosureAccepted: false,
    });
    expect(decision.baseAllow).toBe(true);
    expect(decision.allowContext).toBe(false);
    expect(decision.needsDisclosure).toBe(true);
  });

  it("allows context after disclosure acceptance", () => {
    const decision = evaluateConsent({
      globalAllow: true,
      disclosureAccepted: true,
    });
    expect(decision.allowContext).toBe(true);
  });

  it("doc override deny wins over global allow", () => {
    const decision = evaluateConsent({
      globalAllow: true,
      docOverride: "deny",
      disclosureAccepted: true,
    });
    expect(decision.baseAllow).toBe(false);
    expect(decision.allowContext).toBe(false);
  });
});

describe("buildContextSections", () => {
  it("prefers selection over page context by default", () => {
    const sections = buildContextSections({
      selectedText: "Selected",
      pageContext: "Page content",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBe("Selected Text");
  });

  it("falls back to page context when selection is empty", () => {
    const sections = buildContextSections({
      selectedText: "   ",
      pageContext: "Page content",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBe("Visible Content");
  });

  it("includes extra sections with stable block ids", () => {
    const sections = buildContextSections({
      extraSections: [
        {
          label: "Project Tasks",
          text: "Task context",
          blockId: "project_tasks",
        },
      ],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.blockId).toBe("project_tasks");
  });
});

describe("redactSensitiveText", () => {
  it("redacts obvious secrets and PII", () => {
    const input =
      "Email test@example.com, key sk-1234567890abcdef, Bearer abcdef123456, phone +1 415-555-1234.";
    const result = redactSensitiveText(input);
    expect(result.text).toContain("[REDACTED]");
    expect(result.summary.total).toBeGreaterThan(0);
  });
});

describe("createContextPayload", () => {
  it("returns null when no context is provided", () => {
    const payload = createContextPayload({});
    expect(payload).toBeNull();
  });

  it("applies data access policy limits", () => {
    const payload = createContextPayload({
      selectedText: "abcdef",
      policy: { max_context_chars: 3, redaction_strategy: "mask", pii_handling: "mask" },
    });
    expect(payload).not.toBeNull();
    expect(payload?.sections[0]?.text.length).toBeLessThanOrEqual(3);
    expect(payload?.sections[0]?.truncated).toBe(true);
  });

  it("uses block ids to filter extra sections", () => {
    const payload = createContextPayload({
      selectedText: "Selected",
      extraSections: [{ label: "Project Tasks", text: "Task details", blockId: "project_tasks" }],
      policy: {
        max_context_chars: 8000,
        redaction_strategy: "mask",
        pii_handling: "mask",
        allow_blocks: ["project_tasks"],
      },
    });
    expect(payload).not.toBeNull();
    expect(payload?.sections).toHaveLength(1);
    expect(payload?.sections[0]?.label).toBe("Project Tasks");
  });
});

describe("composePromptWithContext", () => {
  it("appends context block when provided", () => {
    const prompt = composePromptWithContext("Hello", "--- Context ---\n[Selected Text]:\nHi");
    expect(prompt).toContain("Hello");
    expect(prompt).toContain("--- Context ---");
  });

  it("returns prompt unchanged when no context is provided", () => {
    const prompt = composePromptWithContext("Hello", null);
    expect(prompt).toBe("Hello");
  });
});
