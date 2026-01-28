"use client";

import { cn } from "@ku0/shared/utils";
import {
  AlertCircle,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Link2,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
// import { useTranslations } from "next-intl";
import * as React from "react";
import {
  DEFAULT_PROVIDER_NAMES,
  type ProviderId,
  useProviderConfig,
} from "../../context/ProviderConfigContext";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Tooltip } from "../ui/Tooltip";
import { AnthropicIcon, DeepSeekIcon, GoogleIcon, MoonshotIcon, OpenAIIcon } from "./ProviderIcons";

// Simplified translation hook for shell
const useShellTranslations = (_namespace: string) => {
  return (key: string) => {
    const translations: Record<string, string> = {
      providerSettingsTitle: "Provider Settings",
      providerSettingsDescription:
        "Configure your AI providers here. API keys are stored locally in your browser and encrypted.",
      providerConfigured: "Configured",
      providerSettingsTip: "Your keys are never sent to our servers.",
      providerBack: "Back",
      providerApiKey: "API Key",
      providerApiKeyPlaceholder: "sk-...",
      providerHideKey: "Hide Key",
      providerShowKey: "Show Key",
      providerGetApiKey: "Get API Key",
      providerBaseUrl: "Base URL",
      providerOptional: "Optional",
      providerBaseUrlHint: "Leave empty for default",
      providerCompatibleTitle: "OpenAI Compatible",
      providerCompatibleDescription: "This provider supports the OpenAI API format.",
      providerInvalidKey: "Invalid API Key",
      providerResetTooltip: "Reset to Default",
      providerReset: "Reset",
      providerCancel: "Cancel",
      providerSaving: "Saving...",
      providerSaved: "Saved",
      providerSave: "Save",
    };
    return translations[key] || key;
  };
};

export interface ProviderSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProviderIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export interface ProviderMeta {
  id: ProviderId;
  icon: ProviderIcon;
  description: string;
  docsUrl: string;
  apiKeyUrl: string;
  supportsCustomUrl: boolean;
  tone: { bg: string; text: string; border: string };
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: "openai",
    icon: OpenAIIcon,
    description: "GPT-4o, GPT-3.5 Turbo",
    docsUrl: "https://platform.openai.com/docs",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    supportsCustomUrl: true,
    tone: {
      bg: "bg-accent-emerald/10",
      text: "text-accent-emerald",
      border: "border-accent-emerald/20",
    },
  },
  {
    id: "claude",
    icon: AnthropicIcon,
    description: "Claude 3.5 Sonnet, Claude 3 Opus",
    docsUrl: "https://docs.anthropic.com",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    supportsCustomUrl: true,
    tone: {
      bg: "bg-accent-amber/10",
      text: "text-accent-amber",
      border: "border-accent-amber/20",
    },
  },
  {
    id: "gemini",
    icon: GoogleIcon,
    description: "Gemini 1.5 Pro, Gemini 1.5 Flash",
    docsUrl: "https://ai.google.dev/docs",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    supportsCustomUrl: false,
    tone: {
      bg: "bg-accent-cyan/10",
      text: "text-accent-cyan",
      border: "border-accent-cyan/20",
    },
  },
  {
    id: "deepseek",
    icon: DeepSeekIcon,
    description: "DeepSeek V3, DeepSeek Coder",
    docsUrl: "https://platform.deepseek.com/api-docs",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    supportsCustomUrl: true,
    tone: {
      bg: "bg-accent-indigo/10",
      text: "text-accent-indigo",
      border: "border-accent-indigo/20",
    },
  },
  {
    id: "moonshot",
    icon: MoonshotIcon,
    description: "Moonshot Kimi, Long Context",
    docsUrl: "https://platform.moonshot.cn/docs",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    supportsCustomUrl: true,
    tone: {
      bg: "bg-accent-violet/10",
      text: "text-accent-violet",
      border: "border-accent-violet/20",
    },
  },
];

export function ProviderSettingsModal({ open, onOpenChange }: ProviderSettingsModalProps) {
  const t = useShellTranslations("AIPanel");
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderId | null>(null);

  const handleBack = React.useCallback(() => {
    setSelectedProvider(null);
  }, []);

  // Reset selection when modal closes
  React.useEffect(() => {
    if (!open) {
      setSelectedProvider(null);
    }
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={selectedProvider ? undefined : t("providerSettingsTitle")}
      side="right"
      width="400px"
    >
      {selectedProvider ? (
        <ProviderDetailView
          providerId={selectedProvider}
          onBack={handleBack}
          onClose={() => onOpenChange(false)}
        />
      ) : (
        <ProviderListView onSelectProvider={setSelectedProvider} />
      )}
    </Sheet>
  );
}

interface ProviderListViewProps {
  onSelectProvider: (providerId: ProviderId) => void;
}

export function ProviderListView({ onSelectProvider }: ProviderListViewProps) {
  const t = useShellTranslations("AIPanel");
  const { state, isProviderConfigured } = useProviderConfig();

  return (
    <div className="flex flex-col h-full">
      {/* Header info */}
      <div className="px-4 py-3 border-b border-border/30">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("providerSettingsDescription")}
        </p>
      </div>

      {/* Provider list */}
      <div
        className="flex-1 overflow-y-auto scrollbar-auto-hide"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
      >
        <div className="p-2 space-y-1">
          {PROVIDER_META.map((provider) => {
            const Icon = provider.icon;
            const isConfigured = isProviderConfigured(provider.id);
            const config = state.providers[provider.id];

            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => onSelectProvider(provider.id)}
                className={cn(
                  "group w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left",
                  "transition-all duration-normal ease-out",
                  "border border-transparent",
                  "hover:bg-surface-2/60 hover:border-border/30",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                )}
              >
                {/* Provider icon */}
                <span
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    "transition-transform duration-normal group-hover:scale-105",
                    provider.tone.bg,
                    provider.tone.border,
                    "border"
                  )}
                >
                  <Icon className={cn("h-5 w-5", provider.tone.text)} aria-hidden="true" />
                </span>

                {/* Provider info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {config.displayName || DEFAULT_PROVIDER_NAMES[provider.id]}
                    </span>
                    {isConfigured && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-success text-micro font-medium">
                        <Check className="h-2.5 w-2.5" />
                        {t("providerConfigured")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/70 truncate block">
                    {provider.description}
                  </span>
                </div>

                {/* Arrow */}
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground/40 shrink-0",
                    "transition-transform duration-normal",
                    "group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer tip */}
      <div className="px-4 py-3 border-t border-border/30">
        <div className="flex items-start gap-2 text-fine text-muted-foreground/70">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-accent-amber" />
          <span>{t("providerSettingsTip")}</span>
        </div>
      </div>
    </div>
  );
}

interface ProviderDetailViewProps {
  providerId: ProviderId;
  onBack?: () => void;
  onClose?: () => void;
}

export function ProviderDetailView({ providerId, onBack, onClose }: ProviderDetailViewProps) {
  const t = useShellTranslations("AIPanel");
  const { state, updateProvider, resetProvider, getDefaultBaseUrl } = useProviderConfig();
  const config = state.providers[providerId];
  const meta = PROVIDER_META.find((p) => p.id === providerId);

  const [apiKey, setApiKey] = React.useState(config.apiKey);
  const [baseUrl, setBaseUrl] = React.useState(config.baseUrl);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "success" | "error">("idle");

  const hasChanges = apiKey !== config.apiKey || baseUrl !== config.baseUrl;
  const isValid = apiKey.trim().length > 0;

  const handleSave = React.useCallback(() => {
    setIsSaving(true);
    setSaveStatus("idle");

    // Simulate a brief delay for UX
    setTimeout(() => {
      updateProvider(providerId, {
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || getDefaultBaseUrl(providerId),
        enabled: apiKey.trim().length > 0,
      });
      setIsSaving(false);
      setSaveStatus("success");

      // Clear success status after 2s
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 300);
  }, [providerId, apiKey, baseUrl, updateProvider, getDefaultBaseUrl]);

  const handleReset = React.useCallback(() => {
    resetProvider(providerId);
    setApiKey("");
    setBaseUrl(getDefaultBaseUrl(providerId));
  }, [providerId, resetProvider, getDefaultBaseUrl]);

  if (!meta) {
    return null;
  }

  const Icon = meta.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors duration-fast"
          aria-label={t("providerBack")}
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>

        <span
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center",
            meta.tone.bg,
            meta.tone.border,
            "border"
          )}
        >
          <Icon className={cn("h-4 w-4", meta.tone.text)} aria-hidden="true" />
        </span>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {config.displayName || DEFAULT_PROVIDER_NAMES[providerId]}
          </h3>
          <p className="text-fine text-muted-foreground/70">{meta.description}</p>
        </div>
      </div>

      {/* Form content */}
      <div
        className="flex-1 overflow-y-auto scrollbar-auto-hide p-4 space-y-5"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
      >
        {/* API Key field */}
        <div className="space-y-2">
          <label
            htmlFor={`api-key-${providerId}`}
            className="flex items-center gap-2 text-xs font-medium text-foreground"
          >
            <Key className="h-3.5 w-3.5 text-muted-foreground" />
            {t("providerApiKey")}
            <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              id={`api-key-${providerId}`}
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("providerApiKeyPlaceholder")}
              className={cn(
                "w-full px-3 py-2.5 pr-10 rounded-xl text-sm",
                "bg-surface-2/50 border border-border/40",
                "placeholder:text-muted-foreground/40",
                "focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10",
                "transition-all duration-normal"
              )}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-surface-2 transition-colors duration-fast"
              aria-label={showApiKey ? t("providerHideKey") : t("providerShowKey")}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <a
            href={meta.apiKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-fine text-primary hover:text-primary/80 transition-colors duration-fast"
          >
            {t("providerGetApiKey")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Base URL field */}
        {meta.supportsCustomUrl && (
          <div className="space-y-2">
            <label
              htmlFor={`base-url-${providerId}`}
              className="flex items-center gap-2 text-xs font-medium text-foreground"
            >
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              {t("providerBaseUrl")}
              <span className="text-muted-foreground/50 font-normal">
                ({t("providerOptional")})
              </span>
            </label>
            <input
              id={`base-url-${providerId}`}
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={getDefaultBaseUrl(providerId)}
              className={cn(
                "w-full px-3 py-2.5 rounded-xl text-sm font-mono",
                "bg-surface-2/50 border border-border/40",
                "placeholder:text-muted-foreground/40",
                "focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10",
                "transition-all duration-normal"
              )}
              aria-label={t("providerBaseUrl")}
            />
            <p className="text-fine text-muted-foreground/60">{t("providerBaseUrlHint")}</p>
          </div>
        )}

        {/* OpenAI-compatible notice */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-2/50 border border-border/30">
          <Settings2 className="h-4 w-4 text-muted-foreground/70 shrink-0 mt-0.5" />
          <div className="text-fine text-muted-foreground/80 leading-relaxed">
            <span className="font-medium text-foreground/80">{t("providerCompatibleTitle")}</span>
            <br />
            {t("providerCompatibleDescription")}
          </div>
        </div>

        {/* Error state */}
        {!isValid && apiKey.length > 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-xs text-destructive">{t("providerInvalidKey")}</span>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/40">
        <Tooltip content={t("providerResetTooltip")} side="top" sideOffset={6}>
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              "p-2 rounded-lg text-muted-foreground/60",
              "hover:text-destructive hover:bg-destructive/10",
              "transition-colors duration-fast"
            )}
            aria-label={t("providerReset")}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </Tooltip>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("providerCancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !isValid || isSaving}
            className="min-w-[80px]"
          >
            {isSaving ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                {t("providerSaving")}
              </span>
            ) : saveStatus === "success" ? (
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {t("providerSaved")}
              </span>
            ) : (
              t("providerSave")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
