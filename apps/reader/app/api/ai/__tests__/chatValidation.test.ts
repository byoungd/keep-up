import { getModelCapability } from "@/lib/ai/models";
import { describe, expect, it } from "vitest";
import { validateChatRequest } from "../chatValidation";

describe("validateChatRequest", () => {
  it("rejects empty prompts", () => {
    const error = validateChatRequest({
      prompt: "",
      capability: getModelCapability("gpt-5.2-auto"),
      attachments: undefined,
    });

    expect(error?.code).toBe("missing_prompt");
    expect(error?.status).toBe(400);
  });

  it("rejects image attachments when the model lacks vision", () => {
    const capability = getModelCapability("gemini-3-flash");
    expect(capability?.supports.vision).toBe(false);

    const error = validateChatRequest({
      prompt: "Review this image",
      capability,
      attachments: [{ type: "image", url: "https://example.com/a.png" }],
    });

    expect(error?.code).toBe("unsupported_capability");
    expect(error?.status).toBe(422);
  });
});
