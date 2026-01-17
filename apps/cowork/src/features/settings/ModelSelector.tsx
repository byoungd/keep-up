/**
 * Model Selector Component
 *
 * Provider-grouped dropdown with capability badges for model selection.
 * Shows available providers, their models, and key status.
 */

import { useCallback, useMemo, useState } from "react";

interface ModelCapability {
  id: string;
  label: string;
  shortLabel?: string;
  contextWindow: number;
  supports: {
    vision: boolean;
    tools: boolean;
    thinking: boolean;
  };
  pricing?: {
    inputTokensPer1M: number;
    outputTokensPer1M: number;
  };
}

interface ProviderInfo {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  accentColor?: string;
  models: ModelCapability[];
  hasKey: boolean;
  source: "settings" | "env" | "none";
}

interface ModelSelectorProps {
  providers: ProviderInfo[];
  selectedModelId?: string;
  onSelectModel: (modelId: string, providerId: string) => void;
  disabled?: boolean;
}

function CapabilityBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`model-selector__badge ${active ? "model-selector__badge--active" : ""}`}
      title={active ? `Supports ${label}` : `No ${label} support`}
    >
      {label}
    </span>
  );
}

function ProviderGroup({
  provider,
  selectedModelId,
  onSelectModel,
}: {
  provider: ProviderInfo;
  selectedModelId?: string;
  onSelectModel: (modelId: string, providerId: string) => void;
}) {
  const [expanded, setExpanded] = useState(provider.models.some((m) => m.id === selectedModelId));

  const toggleExpand = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="model-selector__group">
      <button
        type="button"
        className="model-selector__group-header"
        onClick={toggleExpand}
        style={{ borderLeftColor: provider.accentColor ?? "#666" }}
      >
        <span className="model-selector__provider-name">{provider.shortName}</span>
        {provider.hasKey ? (
          <span
            className="model-selector__key-status model-selector__key-status--active"
            title="API key configured"
          >
            ●
          </span>
        ) : provider.source === "none" ? (
          <span
            className="model-selector__key-status model-selector__key-status--missing"
            title="No API key"
          >
            ○
          </span>
        ) : null}
        <span className="model-selector__expand-icon">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <ul className="model-selector__model-list">
          {provider.models.map((model) => {
            const isSelected = model.id === selectedModelId;
            return (
              <li key={model.id}>
                <button
                  type="button"
                  className={`model-selector__model-item ${isSelected ? "model-selector__model-item--selected" : ""}`}
                  onClick={() => onSelectModel(model.id, provider.id)}
                  disabled={!provider.hasKey && provider.id !== "ollama"}
                >
                  <span className="model-selector__model-name">
                    {model.shortLabel ?? model.label}
                  </span>
                  <span className="model-selector__badges">
                    <CapabilityBadge label="V" active={model.supports.vision} />
                    <CapabilityBadge label="T" active={model.supports.tools} />
                    <CapabilityBadge label="R" active={model.supports.thinking} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ModelSelector({
  providers,
  selectedModelId,
  onSelectModel,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedModel = useMemo(() => {
    for (const provider of providers) {
      const model = provider.models.find((m) => m.id === selectedModelId);
      if (model) {
        return { model, provider };
      }
    }
    return null;
  }, [providers, selectedModelId]);

  const handleSelect = useCallback(
    (modelId: string, providerId: string) => {
      onSelectModel(modelId, providerId);
      setOpen(false);
    },
    [onSelectModel]
  );

  return (
    <div className={`model-selector ${disabled ? "model-selector--disabled" : ""}`}>
      <button
        type="button"
        className="model-selector__trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className="model-selector__selected-label">
          {selectedModel
            ? (selectedModel.model.shortLabel ?? selectedModel.model.label)
            : "Select model"}
        </span>
        <span className="model-selector__dropdown-icon">▾</span>
      </button>
      {open && (
        <div className="model-selector__dropdown">
          {providers.map((provider) => (
            <ProviderGroup
              key={provider.id}
              provider={provider}
              selectedModelId={selectedModelId}
              onSelectModel={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
