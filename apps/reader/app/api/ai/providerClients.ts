import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { AnthropicProvider, OpenAIProvider as CoreOpenAIProvider } from "@keepup/ai-core";
import { type ProviderConfig, pickApiKey } from "./providerResolver";

class OpenAICompatibleProvider extends CoreOpenAIProvider {
  // Allow arbitrary model IDs (for OpenAI-compatible backends)
  // eslint-disable-next-line class-methods-use-this
  protected getModel(requestModel: string): string {
    return requestModel || this.defaultModel;
  }
}

export function createOpenAIProvider(config: ProviderConfig): CoreOpenAIProvider {
  const apiKey = pickApiKey(config);

  if (config.provider === "openai") {
    return new CoreOpenAIProvider({
      apiKey,
      baseUrl: config.baseUrl,
    });
  }

  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl: config.baseUrl,
  });
}

export function createGoogleClient(config: ProviderConfig) {
  const apiKey = pickApiKey(config);
  if (config.baseUrl) {
    return createGoogleGenerativeAI({ apiKey, baseURL: config.baseUrl });
  }
  return createGoogleGenerativeAI({ apiKey });
}

export function createAnthropicClient(config: ProviderConfig): AnthropicProvider {
  const apiKey = pickApiKey(config);
  return new AnthropicProvider({
    apiKey,
    baseUrl: config.baseUrl,
  });
}
