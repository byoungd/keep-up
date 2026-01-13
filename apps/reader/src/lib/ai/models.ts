import type { ModelCapability } from "@keepup/ai-core";
import {
  MODEL_CATALOG,
  getDefaultModelId as getDefaultModelIdFromCatalog,
  getModelCapability as getModelCapabilityFromCatalog,
} from "@keepup/ai-core";

export type { ModelCapability } from "@keepup/ai-core";
export { normalizeModelId } from "@keepup/ai-core";

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
