import type { ModelCapability } from "@/lib/ai/models";

export type ChatValidationErrorCode = "missing_prompt" | "invalid_model" | "unsupported_capability";

export type ChatValidationError = {
  code: ChatValidationErrorCode;
  message: string;
  status: number;
};

type ChatAttachment = Array<{ type: "image"; url: string }>;

export function validateChatRequest(options: {
  prompt: string | undefined;
  capability: ModelCapability | undefined;
  attachments: ChatAttachment | undefined;
}): ChatValidationError | null {
  const { prompt, capability, attachments } = options;

  if (!prompt) {
    return { code: "missing_prompt", message: "prompt is required", status: 400 };
  }

  if (!capability) {
    return { code: "invalid_model", message: "model not allowed", status: 400 };
  }

  if (attachments && attachments.length > 0 && !capability.supports.vision) {
    return {
      code: "unsupported_capability",
      message: "selected model does not support image attachments",
      status: 422,
    };
  }

  return null;
}
