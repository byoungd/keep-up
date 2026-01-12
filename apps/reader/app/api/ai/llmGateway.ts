import type { Message } from "@keepup/ai-core";
import { generateText, streamText } from "ai";
import { toModelMessages } from "./messageUtils";
import { createAnthropicClient, createGoogleClient, createOpenAIProvider } from "./providerClients";
import type { ProviderTarget } from "./providerResolver";

/**
 * Stream content from the selected provider in a provider-kind aware way.
 * Keeps all provider-specific streaming logic in one place.
 */
export async function* streamProviderContent(
  target: ProviderTarget,
  messages: Message[]
): AsyncIterable<string> {
  if (target.config.kind === "anthropic") {
    yield* streamAnthropic(target, messages);
    return;
  }

  if (target.config.kind === "gemini") {
    yield* streamGemini(target, messages);
    return;
  }

  yield* streamOpenAICompatible(target, messages);
}

async function* streamAnthropic(target: ProviderTarget, messages: Message[]) {
  const provider = createAnthropicClient(target.config);
  for await (const chunk of provider.stream({ messages, model: target.modelId })) {
    if (chunk.type === "content" && chunk.content) {
      yield chunk.content;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error);
    }
  }
}

async function* streamGemini(target: ProviderTarget, messages: Message[]) {
  const modelMessages = toModelMessages(messages);
  const google = createGoogleClient(target.config);
  const result = await streamText({
    model: google(target.modelId),
    messages: modelMessages,
  });
  for await (const delta of result.textStream) {
    if (delta) {
      yield delta;
    }
  }
}

async function* streamOpenAICompatible(target: ProviderTarget, messages: Message[]) {
  const openai = createOpenAIProvider(target.config);
  for await (const chunk of openai.stream({ messages, model: target.modelId })) {
    if (chunk.type === "content" && chunk.content) {
      yield chunk.content;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error);
    }
  }
}

/**
 * Non-streaming completion from the selected provider.
 */
export async function completeWithProvider(
  target: ProviderTarget,
  messages: Message[]
): Promise<string> {
  if (target.config.kind === "anthropic") {
    const provider = createAnthropicClient(target.config);
    const completion = await provider.complete({
      messages,
      model: target.modelId,
    });
    return completion.content;
  }

  const modelMessages = toModelMessages(messages);

  if (target.config.kind === "gemini") {
    const google = createGoogleClient(target.config);
    const result = await generateText({
      model: google(target.modelId),
      messages: modelMessages,
    });
    return result.text;
  }

  const openai = createOpenAIProvider(target.config);
  const completion = await openai.complete({
    messages,
    model: target.modelId,
  });
  return completion.content;
}
