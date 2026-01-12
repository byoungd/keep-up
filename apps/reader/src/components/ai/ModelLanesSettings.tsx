"use client";

import { Label } from "@/components/ui/Label";
import { Select, SelectOption } from "@/components/ui/Select";
import { type LaneId, type ProviderId, useProviderConfig } from "@/context/ProviderConfigContext";

/** Available models for each lane type */
const FAST_LANE_MODELS = [
  { id: "gpt-5.2-instant", label: "GPT-5.2 Instant", provider: "openai" as ProviderId },
  { id: "claude-sonnet-4-5", label: "Claude 4.5 Sonnet", provider: "claude" as ProviderId },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", provider: "gemini" as ProviderId },
  { id: "deepseek-v3", label: "DeepSeek V3", provider: "deepseek" as ProviderId },
];

const DEEP_LANE_MODELS = [
  { id: "gpt-5.2-pro", label: "GPT-5.2 Pro", provider: "openai" as ProviderId },
  {
    id: "claude-opus-4-5",
    label: "Claude 4.5 Opus",
    provider: "claude" as ProviderId,
  },
  { id: "gemini-3-pro-high", label: "Gemini 3 Pro High", provider: "gemini" as ProviderId },
  { id: "deepseek-r1", label: "DeepSeek R1", provider: "deepseek" as ProviderId },
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
