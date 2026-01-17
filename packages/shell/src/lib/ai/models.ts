import type { ModelCapability } from "@ku0/ai-core";
import {
  getDefaultModelId as getDefaultModelIdFromCatalog,
  getModelCapability as getModelCapabilityFromCatalog,
  MODEL_CATALOG,
} from "@ku0/ai-core";

export type { ModelCapability } from "@ku0/ai-core";
export { normalizeModelId } from "@ku0/ai-core";

export const MODEL_CAPABILITIES: ModelCapability[] = MODEL_CATALOG;

export function getModelCapability(modelId: string | undefined): ModelCapability | undefined {
  return getModelCapabilityFromCatalog(modelId);
}

export function getDefaultModel(): ModelCapability {
  return (
    MODEL_CAPABILITIES.find((entry) => entry.default) ??
    MODEL_CAPABILITIES.find((entry) => entry.id === getDefaultModelIdFromCatalog()) ??
    MODEL_CAPABILITIES[0]
  );
}
