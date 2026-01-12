"use client";

import { Label } from "@/components/ui/Label";
import { Select, SelectOption } from "@/components/ui/Select";
import { type LaneId, type ProviderId, useProviderConfig } from "@/context/ProviderConfigContext";

/** Available models for each lane type */
const FAST_LANE_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" as ProviderId },
  { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku", provider: "anthropic" as ProviderId },
  { id: "gemini-1.5-flash", label: "Gemini Flash 1.5", provider: "google" as ProviderId },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" as ProviderId },
];

const DEEP_LANE_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" as ProviderId },
  {
    id: "claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic" as ProviderId,
  },
  { id: "gemini-1.5-pro", label: "Gemini Pro 1.5", provider: "google" as ProviderId },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner", provider: "deepseek" as ProviderId },
];

export function ModelLanesSettings() {
  const { state, updateLane, isProviderConfigured } = useProviderConfig();

  const handleLaneChange = (laneId: LaneId, modelId: string) => {
    // Find the model to get its provider
    const allModels = [...FAST_LANE_MODELS, ...DEEP_LANE_MODELS];
    const model = allModels.find((m) => m.id === modelId);
    if (model) {
      updateLane(laneId, { modelId, providerId: model.provider });
    }
  };

  const getModelStatus = (providerId: ProviderId): string => {
    return isProviderConfigured(providerId) ? "" : " (No API Key)";
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Model Lanes</h3>
        <p className="text-sm text-muted-foreground">
          Configure which models fuel your reading workflows.
        </p>
      </div>

      <div className="space-y-4 border p-4 rounded-md bg-surface-2/30">
        {/* Fast Lane */}
        <div className="grid gap-2">
          <Label htmlFor="fast-lane-model">Fast Lane (Explanations, Chat)</Label>
          <Select
            id="fast-lane-model"
            value={state.lanes.fast.modelId}
            onChange={(e) => handleLaneChange("fast", e.target.value)}
            fullWidth
          >
            {FAST_LANE_MODELS.map((model) => (
              <SelectOption key={model.id} value={model.id}>
                {model.label}
                {getModelStatus(model.provider)}
              </SelectOption>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Used for low-latency tasks like translation and quick Q&A.
          </p>
        </div>

        {/* Deep Lane */}
        <div className="grid gap-2">
          <Label htmlFor="deep-lane-model">Deep Lane (Digest, Research)</Label>
          <Select
            id="deep-lane-model"
            value={state.lanes.deep.modelId}
            onChange={(e) => handleLaneChange("deep", e.target.value)}
            fullWidth
          >
            {DEEP_LANE_MODELS.map((model) => (
              <SelectOption key={model.id} value={model.id}>
                {model.label}
                {getModelStatus(model.provider)}
              </SelectOption>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Used for complex reasoning, synthesis, and report generation.
          </p>
        </div>
      </div>
    </div>
  );
}
