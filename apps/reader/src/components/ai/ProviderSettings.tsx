"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  DEFAULT_PROVIDER_NAMES,
  type ProviderId,
  SUPPORTED_PROVIDER_IDS,
  useProviderConfig,
} from "@/context/ProviderConfigContext";
import { Check, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

const PROVIDER_IDS: ProviderId[] = SUPPORTED_PROVIDER_IDS;

interface ProviderRowProps {
  providerId: ProviderId;
  showKey: boolean;
  onToggleShowKey: () => void;
}

function ProviderRow({ providerId, showKey, onToggleShowKey }: ProviderRowProps) {
  const { state, updateProvider, resetProvider, getDefaultBaseUrl, isHydrated } =
    useProviderConfig();
  const config = state.providers[providerId];
  const [localKey, setLocalKey] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  // Sync local state with context after hydration
  React.useEffect(() => {
    if (isHydrated) {
      setLocalKey(config.apiKey);
    }
  }, [isHydrated, config.apiKey]);

  const handleSave = () => {
    updateProvider(providerId, {
      apiKey: localKey,
      enabled: localKey.length > 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetProvider(providerId);
    setLocalKey("");
  };

  const hasChanges = localKey !== config.apiKey;

  return (
    <div className="space-y-3 border p-4 rounded-md bg-surface-2/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{DEFAULT_PROVIDER_NAMES[providerId]}</span>
          {config.enabled && config.apiKey && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
              Active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          aria-label={`Reset ${DEFAULT_PROVIDER_NAMES[providerId]}`}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${providerId}-key`} className="text-xs text-muted-foreground">
          API Key
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={`${providerId}-key`}
              type={showKey ? "text" : "password"}
              placeholder={providerId === "openai" ? "sk-..." : "Enter API key"}
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              aria-label={`${DEFAULT_PROVIDER_NAMES[providerId]} API Key`}
            />
            <button
              type="button"
              onClick={onToggleShowKey}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges}
            variant={saved ? "outline" : "primary"}
            type="button"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4 mr-2 text-green-500" />
                Saved
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      {providerId === "custom" && (
        <div className="grid gap-2">
          <Label htmlFor="custom-baseurl" className="text-xs text-muted-foreground">
            Base URL (OpenAI-compatible)
          </Label>
          <Input
            id="custom-baseurl"
            type="text"
            placeholder="https://api.example.com/v1"
            value={config.baseUrl}
            onChange={(e) => updateProvider(providerId, { baseUrl: e.target.value })}
            aria-label="Custom provider base URL"
          />
        </div>
      )}

      {providerId !== "custom" && (
        <p className="text-xs text-muted-foreground">Base URL: {getDefaultBaseUrl(providerId)}</p>
      )}
    </div>
  );
}

export function ProviderSettings() {
  const t = useTranslations("AIPanel");
  const [showKeys, setShowKeys] = React.useState<Record<ProviderId, boolean>>(
    () => Object.fromEntries(PROVIDER_IDS.map((id) => [id, false])) as Record<ProviderId, boolean>
  );

  const toggleShowKey = (providerId: ProviderId) => {
    setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("providerSettingsTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("providerSettingsDescription")}</p>
      </div>

      <div className="space-y-4">
        {PROVIDER_IDS.map((providerId) => (
          <ProviderRow
            key={providerId}
            providerId={providerId}
            showKey={showKeys[providerId]}
            onToggleShowKey={() => toggleShowKey(providerId)}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("providerSettingsTip")} Keys are encrypted before storage.
      </p>
    </div>
  );
}
