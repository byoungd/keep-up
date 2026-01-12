"use client";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { List } from "@/components/ui/List";
import { Tooltip } from "@/components/ui/Tooltip";
import { type ModelCapability, normalizeModelId } from "@/lib/ai/models";
import { cn } from "@keepup/shared/utils";
import {
  Archive,
  Brain,
  ChevronDown,
  Eye,
  Feather,
  FileText,
  Funnel,
  Gauge,
  Image,
  Info,
  LayoutGrid,
  Search,
  Settings,
  Sigma,
  Star,
  Wrench,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import {
  AlibabaIcon,
  AnthropicIcon,
  DeepSeekIcon,
  GoogleIcon,
  MetaIcon,
  MiniMaxIcon,
  MoonshotIcon,
  OpenAIIcon,
  StealthIcon,
  XAIIcon,
  ZAIIcon,
} from "./ProviderIcons";
import { ProviderDetailView, ProviderListView } from "./ProviderSettingsModal";

export type PanelPosition = "left" | "right";

export interface ModelSelectorProps {
  model: string;
  models: ModelCapability[];
  onSelect: (modelId: string) => void;
  className?: string;
  /** Which side of the screen this selector lives in. Affects tooltip/dropdown directions. */
  panelPosition?: PanelPosition;
}

const FAVORITES_STORAGE_KEY = "ai-model-favorites-v1";

type ProviderFilter =
  | "all"
  | "favorites"
  | "openai"
  | "claude"
  | "gemini"
  | "alibaba"
  | "deepseek"
  | "meta"
  | "minimax"
  | "moonshot"
  | "xai"
  | "zai"
  | "stealth"
  | "custom";
type FeatureId =
  | "fast"
  | "vision"
  | "reasoning"
  | "effort"
  | "toolCalling"
  | "imageGeneration"
  | "nativePDFs";

type ProviderIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type FeatureDefinition = {
  id: FeatureId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

type ProviderMeta = {
  id: ProviderFilter;
  label: string;
  icon: ProviderIcon;
  tone: string;
  iconTone: string;
  disabled?: boolean;
};

const PROVIDER_ACCENTS: Record<ModelCapability["provider"], { chip: string; icon: string }> = {
  gemini: { chip: "bg-surface-2/80 border border-border/60 shadow-sm", icon: "text-foreground/80" },
  claude: { chip: "bg-surface-2/80 border border-border/60 shadow-sm", icon: "text-foreground/80" },
  openai: { chip: "bg-surface-2/80 border border-border/60 shadow-sm", icon: "text-foreground/80" },
  deepseek: {
    chip: "bg-surface-2/80 border border-border/60 shadow-sm",
    icon: "text-foreground/80",
  },
  meta: { chip: "bg-surface-2/80 border border-border/60 shadow-sm", icon: "text-foreground/80" },
  alibaba: {
    chip: "bg-surface-2/80 border border-border/60 shadow-sm",
    icon: "text-foreground/80",
  },
  minimax: {
    chip: "bg-surface-2/80 border border-border/60 shadow-sm",
    icon: "text-foreground/80",
  },
  moonshot: {
    chip: "bg-surface-2/80 border border-border/60 shadow-sm",
    icon: "text-foreground/80",
  },
  xai: { chip: "bg-surface-2/80 border border-border/60 shadow-sm", icon: "text-foreground/80" },
  zai: { chip: "bg-surface-2/80 border border-border/60 shadow-sm", icon: "text-foreground/80" },
  stealth: {
    chip: "bg-surface-2/80 border border-border/60 shadow-sm",
    icon: "text-foreground/80",
  },
};

const PROVIDER_ICONS: Record<ModelCapability["provider"], ProviderIcon> = {
  gemini: GoogleIcon,
  claude: AnthropicIcon,
  openai: OpenAIIcon,
  deepseek: DeepSeekIcon,
  meta: MetaIcon,
  alibaba: AlibabaIcon,
  minimax: MiniMaxIcon,
  moonshot: MoonshotIcon,
  xai: XAIIcon,
  zai: ZAIIcon,
  stealth: StealthIcon,
};

const PROVIDER_TO_MODEL_PROVIDER: Record<ProviderFilter, ModelCapability["provider"] | null> = {
  all: null,
  favorites: null,
  openai: "openai",
  claude: "claude",
  gemini: "gemini",
  alibaba: "alibaba",
  deepseek: "deepseek",
  meta: "meta",
  minimax: "minimax",
  moonshot: "moonshot",
  xai: "xai",
  zai: "zai",
  stealth: "stealth",
  custom: null,
};

const formatContextWindow = (value: number) => `${Math.round(value / 1000)}k`;

const splitModelLabel = (label: string) => {
  const match = label.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (!match) {
    return { main: label, suffix: "" };
  }
  return { main: match[1].trim(), suffix: match[2].trim() };
};

const getModelFeatureSet = (model: ModelCapability) => {
  const features = new Set<FeatureId>();

  if (model.tags.includes("fast")) {
    features.add("fast");
  }
  if (model.supports.vision) {
    features.add("vision");
  }
  if (model.supports.thinking) {
    features.add("reasoning");
  }
  if (model.tags.includes("thinking")) {
    features.add("effort");
  }
  if (model.supports.tools) {
    features.add("toolCalling");
  }
  if (model.id.includes("image")) {
    features.add("imageGeneration");
  }
  if (model.tags.includes("pdf")) {
    features.add("nativePDFs");
  }

  return features;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex UI component with multiple interactive states
export function ModelSelector({
  model,
  models,
  onSelect,
  className,
  panelPosition = "right",
}: ModelSelectorProps) {
  const t = useTranslations("AIPanel");
  const [search, setSearch] = React.useState("");
  const [activeProvider, setActiveProvider] = React.useState<ProviderFilter>("all");
  const [activeFilters, setActiveFilters] = React.useState<Set<FeatureId>>(new Set());
  const [matchAllFilters, setMatchAllFilters] = React.useState(false);
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());
  const [settingsMode, setSettingsMode] = React.useState(false);
  // Reset settings mode when closing
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setSettingsMode(false);
    }
  };
  const [isLegacyExpanded, setIsLegacyExpanded] = React.useState(false);

  const selectedModel = React.useMemo(
    () => models.find((entry) => entry.id === model),
    [models, model]
  );

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavoriteIds(new Set(parsed));
      }
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteIds]));
  }, [favoriteIds]);

  const tagMeta = React.useMemo(
    () => ({
      balanced: {
        label: t("modelTagBalanced"),
        icon: Gauge,
        tone: "bg-surface-2 text-muted-foreground border border-border/40",
      },
      quality: {
        label: t("modelTagQuality"),
        icon: Star,
        tone: "bg-surface-2 text-muted-foreground border border-border/40",
      },
      lite: {
        label: t("modelTagLite"),
        icon: Feather,
        tone: "bg-surface-2 text-muted-foreground border border-border/40",
      },
    }),
    [t]
  );

  const modelProviderLabels = React.useMemo(
    () => ({
      gemini: t("modelProviderGoogle"),
      claude: t("modelProviderAnthropic"),
      openai: t("modelProviderOpenAI"),
      deepseek: t("modelProviderDeepSeek"),
      meta: t("modelProviderMeta"),
      alibaba: t("modelProviderAlibaba"),
      minimax: t("modelProviderMiniMax"),
      moonshot: t("modelProviderMoonshot"),
      xai: t("modelProviderXAI"),
      zai: t("modelProviderZAI"),
      stealth: t("modelProviderStealth"),
    }),
    [t]
  );

  const featureDefinitions = React.useMemo<FeatureDefinition[]>(
    () => [
      {
        id: "fast",
        label: t("modelFeatureFast"),
        icon: Zap,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
      {
        id: "vision",
        label: t("modelFeatureVision"),
        icon: Eye,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
      {
        id: "reasoning",
        label: t("modelFeatureReasoning"),
        icon: Sigma,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
      {
        id: "effort",
        label: t("modelFeatureEffort"),
        icon: Brain,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
      {
        id: "toolCalling",
        label: t("modelFeatureToolCalling"),
        icon: Wrench,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
      {
        id: "imageGeneration",
        label: t("modelFeatureImageGeneration"),
        icon: Image,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
      {
        id: "nativePDFs",
        label: t("modelFeaturePDF"),
        icon: FileText,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
    ],
    [t]
  );

  const availableFilters = React.useMemo(() => {
    return featureDefinitions.filter((definition) =>
      models.some((entry) => getModelFeatureSet(entry).has(definition.id))
    );
  }, [featureDefinitions, models]);

  const providerAvailability = React.useMemo(() => {
    // All providers are enabled (unified proxy handles routing)
    const availability: Record<ProviderFilter, boolean> = {
      all: true,
      favorites: true,
      openai: true,
      claude: true,
      gemini: true,
      alibaba: true,
      deepseek: true,
      meta: true,
      minimax: true,
      moonshot: true,
      xai: true,
      zai: true,
      stealth: true,
      custom: true,
    };

    return availability;
  }, []);

  const providerMeta = React.useMemo<ProviderMeta[]>(
    () => [
      {
        id: "favorites",
        label: t("modelFavoritesLabel"),
        icon: Star,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.favorites,
      },
      {
        id: "all",
        label: t("modelCategoryAll"),
        icon: LayoutGrid,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: false,
      },
      {
        id: "openai",
        label: t("modelProviderOpenAI"),
        icon: OpenAIIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.openai,
      },
      {
        id: "claude",
        label: t("modelProviderAnthropic"),
        icon: AnthropicIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.claude,
      },
      {
        id: "gemini",
        label: t("modelProviderGoogle"),
        icon: GoogleIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.gemini,
      },
      {
        id: "alibaba",
        label: t("modelProviderAlibaba"),
        icon: AlibabaIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.alibaba,
      },
      {
        id: "deepseek",
        label: t("modelProviderDeepSeek"),
        icon: DeepSeekIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.deepseek,
      },
      {
        id: "meta",
        label: t("modelProviderMeta"),
        icon: MetaIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.meta,
      },
      {
        id: "minimax",
        label: t("modelProviderMiniMax"),
        icon: MiniMaxIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.minimax,
      },
      {
        id: "moonshot",
        label: t("modelProviderMoonshot"),
        icon: MoonshotIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.moonshot,
      },
      {
        id: "xai",
        label: t("modelProviderXAI"),
        icon: XAIIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.xai,
      },
      {
        id: "zai",
        label: t("modelProviderZAI"),
        icon: ZAIIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.zai,
      },
      {
        id: "stealth",
        label: t("modelProviderStealth"),
        icon: StealthIcon,
        tone: "text-foreground",
        iconTone: "text-muted-foreground",
        disabled: !providerAvailability.stealth,
      },
    ],
    [providerAvailability, t]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const searchTokens = React.useMemo(
    () => normalizedSearch.split(/\s+/).filter(Boolean),
    [normalizedSearch]
  );

  const { currentModels, legacyModels } = React.useMemo(() => {
    const current: ModelCapability[] = [];
    const legacy: ModelCapability[] = [];

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filtering logic
    const allFiltered = models.filter((entry) => {
      const activeModelProvider = PROVIDER_TO_MODEL_PROVIDER[activeProvider];

      if (activeProvider === "favorites" && !favoriteIds.has(entry.id)) {
        return false;
      }

      if (activeProvider !== "favorites" && activeProvider !== "all") {
        if (!activeModelProvider || entry.provider !== activeModelProvider) {
          return false;
        }
      }

      if (searchTokens.length > 0) {
        const haystack = [
          entry.label,
          entry.shortLabel,
          entry.description,
          entry.group,
          modelProviderLabels[entry.provider],
          entry.tags.join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchTokens.every((token) => haystack.includes(token))) {
          return false;
        }
      }

      if (activeFilters.size === 0) {
        return true;
      }

      const modelFeatures = getModelFeatureSet(entry);
      const matches = Array.from(activeFilters).map((feature) => modelFeatures.has(feature));

      return matchAllFilters ? matches.every(Boolean) : matches.some(Boolean);
    });

    for (const m of allFiltered) {
      if (m.legacy) {
        legacy.push(m);
      } else {
        current.push(m);
      }
    }

    return { currentModels: current, legacyModels: legacy };
  }, [
    models,
    activeProvider,
    favoriteIds,
    searchTokens,
    activeFilters,
    matchAllFilters,
    modelProviderLabels,
  ]);

  const activeFilterDetails = React.useMemo(
    () => availableFilters.filter((option) => activeFilters.has(option.id)),
    [availableFilters, activeFilters]
  );

  const handleFilterToggle = React.useCallback((filterId: FeatureId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filterId)) {
        next.delete(filterId);
      } else {
        next.add(filterId);
      }
      return next;
    });
  }, []);

  const handleFilterClear = React.useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  const handleFavoriteToggle = React.useCallback((modelId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }, []);

  const showFavoritesEmpty = activeProvider === "favorites" && favoriteIds.size === 0;
  const actionLabels = React.useMemo(
    () => ({
      favoriteAdd: t("modelFavoriteAdd"),
      favoriteRemove: t("modelFavoriteRemove"),
      detailOpen: t("modelDetailOpen"),
    }),
    [t]
  );

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="compact"
            className={cn(
              "group flex items-center gap-2 px-2 py-1 h-10 text-left rounded-xl transition-all duration-300",
              "hover:bg-surface-2/60 hover:shadow-sm",
              "data-[state=open]:bg-surface-2 data-[state=open]:shadow-md",
              "focus-visible:ring-2 focus-visible:ring-primary/20",
              className
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedModel && (
                <div
                  className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                    "transition-all duration-200 group-hover:scale-105 group-data-[state=open]:scale-105",
                    PROVIDER_ACCENTS[selectedModel.provider].chip
                  )}
                >
                  {React.createElement(PROVIDER_ICONS[selectedModel.provider], {
                    className: cn("h-3.5 w-3.5", PROVIDER_ACCENTS[selectedModel.provider].icon),
                    "aria-hidden": true,
                  })}
                </div>
              )}
              <div className="flex flex-col items-start leading-none gap-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate max-w-[140px] text-foreground">
                    {(() => {
                      if (selectedModel) {
                        return selectedModel.shortLabel || selectedModel.label;
                      }

                      const migratedId = normalizeModelId(model);
                      if (migratedId) {
                        const migratedModel = models.find((entry) => entry.id === migratedId);
                        if (migratedModel) {
                          return migratedModel.shortLabel || migratedModel.label;
                        }
                      }

                      // Fallback: Title Case the ID
                      return model
                        .split(/[-_]/)
                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(" ");
                    })()}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-300",
                      "group-data-[state=open]:rotate-180"
                    )}
                  />
                </div>
              </div>
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align={panelPosition === "right" ? "end" : "start"}
          sideOffset={12}
          className={cn(
            "w-[500px] max-w-[calc(100vw-24px)] p-0 rounded-2xl overflow-hidden",
            "glass-surface premium-shadow border-border/20",
            "max-h-[85vh] flex flex-col"
          )}
        >
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              className={cn(
                "relative flex min-h-0 flex-1",
                panelPosition === "right" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Provider sidebar */}
              <div
                className={cn(
                  "flex flex-col items-center gap-2 py-4 bg-surface-1/10 backdrop-blur-sm shrink-0",
                  panelPosition === "right"
                    ? "border-l border-border/5 w-16"
                    : "border-r border-border/5 w-16"
                )}
              >
                {providerMeta.map((provider, index) => {
                  const isActive = activeProvider === provider.id;
                  const Icon = provider.icon;
                  const isDisabled = provider.disabled;
                  return (
                    <React.Fragment key={provider.id}>
                      {index === 1 && (
                        <div className="h-px w-8 bg-border/10 my-1" aria-hidden="true" />
                      )}
                      <Tooltip
                        content={provider.label}
                        side={panelPosition === "right" ? "left" : "right"}
                        sideOffset={12}
                      >
                        <button
                          type="button"
                          aria-label={provider.label}
                          aria-pressed={isActive}
                          disabled={isDisabled}
                          aria-disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) {
                              return;
                            }
                            setActiveProvider(provider.id);
                            if (settingsMode) {
                              // In settings mode, clicking a provider stays in settings mode but switches context
                              // unless it's "all" or "favorites", in which case we might default to list view
                            } else {
                              // Normal mode
                            }
                          }}
                          className={cn(
                            "group relative h-10 w-10 rounded-lg flex items-center justify-center",
                            "transition-all duration-200 ease-out",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border/40",
                            isDisabled && "opacity-20 cursor-not-allowed",
                            isActive
                              ? "bg-surface-2 text-foreground"
                              : "text-muted-foreground/50 hover:bg-surface-2/60 hover:text-foreground"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 transition-colors duration-200",
                              isActive ? "text-foreground" : ""
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </Tooltip>
                    </React.Fragment>
                  );
                })}

                {/* Settings button at bottom */}
                <div className="mt-auto pt-2">
                  <div className="h-px w-8 bg-border/10 mb-2" aria-hidden="true" />
                  <Tooltip
                    content={t("modelProviderSettings")}
                    side={panelPosition === "right" ? "left" : "right"}
                    sideOffset={12}
                  >
                    <button
                      type="button"
                      aria-label={
                        settingsMode ? t("modelBackToModels") : t("modelProviderSettings")
                      }
                      onClick={() => setSettingsMode(!settingsMode)}
                      className={cn(
                        "group relative h-11 w-11 rounded-xl flex items-center justify-center transition-all duration-300",
                        settingsMode
                          ? "bg-surface-2 text-foreground shadow-sm"
                          : "text-muted-foreground/60 hover:bg-surface-2/40 hover:text-foreground hover:scale-105"
                      )}
                    >
                      {settingsMode ? (
                        <LayoutGrid className="h-5 w-5" />
                      ) : (
                        <Settings className="h-5 w-5" />
                      )}
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Content area */}
              <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
                {settingsMode ? (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-border/30 shrink-0">
                      <h3 className="text-sm font-semibold">{t("providerSettingsTitle")}</h3>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                      {activeProvider === "all" || activeProvider === "favorites" ? (
                        <ProviderListView onSelectProvider={(id) => setActiveProvider(id)} />
                      ) : (
                        <ProviderDetailView
                          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                          providerId={activeProvider as any}
                          onBack={() => setActiveProvider("all")}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Search header */}
                    <div className="relative px-4 pt-4 pb-2 shrink-0">
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl",
                          "bg-surface-1 border border-border/40",
                          "transition-all duration-200",
                          "focus-within:border-border/60 focus-within:ring-2 focus-within:ring-border/20"
                        )}
                      >
                        <Search className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        <input
                          type="text"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={t("modelSearchPlaceholder")}
                          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                        />
                        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border/40 bg-surface-2/80 px-1.5 text-[10px] font-medium text-muted-foreground/60">
                          ⌘K
                        </kbd>
                      </div>
                    </div>

                    {/* Filter bar */}
                    <div className="flex items-center justify-between gap-2 px-3 pb-2">
                      <div className="flex items-center gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-7 px-2.5 gap-1.5 rounded-lg text-xs font-medium",
                                "transition-all duration-200",
                                "text-muted-foreground hover:text-foreground hover:bg-surface-2/60",
                                activeFilters.size > 0 &&
                                  "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                              )}
                            >
                              <Funnel className="h-3.5 w-3.5" />
                              <span>{t("modelFilterLabel")}</span>
                              {activeFilters.size > 0 && (
                                <span className="h-4 min-w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center px-1">
                                  {activeFilters.size}
                                </span>
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56 rounded-xl">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                              {t("modelFilterLabel")}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {availableFilters.map((filter) => {
                              const Icon = filter.icon;
                              return (
                                <DropdownMenuCheckboxItem
                                  key={filter.id}
                                  checked={activeFilters.has(filter.id)}
                                  onCheckedChange={() => handleFilterToggle(filter.id)}
                                  className="flex items-center gap-2.5 cursor-pointer rounded-lg"
                                >
                                  <span
                                    className={cn(
                                      "h-5 w-5 rounded-md flex items-center justify-center",
                                      filter.tone
                                    )}
                                  >
                                    <Icon className="h-3 w-3" />
                                  </span>
                                  <span className="text-sm">{filter.label}</span>
                                </DropdownMenuCheckboxItem>
                              );
                            })}
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                              checked={matchAllFilters}
                              onCheckedChange={() => setMatchAllFilters((prev) => !prev)}
                              className="cursor-pointer rounded-lg"
                            >
                              {t("modelFilterMatchAll")}
                            </DropdownMenuCheckboxItem>
                            {activeFilters.size > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <button
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-lg transition-colors"
                                  onClick={handleFilterClear}
                                >
                                  {t("modelFilterClear")}
                                </button>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <span className="text-[11px] text-muted-foreground/60 font-medium tabular-nums">
                        {currentModels.length + legacyModels.length}{" "}
                        {currentModels.length + legacyModels.length === 1 ? "model" : "models"}
                      </span>
                    </div>

                    {activeFilterDetails.length > 0 && (
                      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                        {activeFilterDetails.map((filter) => {
                          const Icon = filter.icon;
                          return (
                            <button
                              key={filter.id}
                              type="button"
                              onClick={() => handleFilterToggle(filter.id)}
                              className={cn(
                                "group flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium",
                                "bg-surface-2/60 border border-border/30",
                                "transition-all duration-200",
                                "hover:bg-surface-2 hover:border-border/50 hover:shadow-sm"
                              )}
                              aria-label={`${t("modelFilterClear")} ${filter.label}`}
                            >
                              <span
                                className={cn(
                                  "h-4 w-4 rounded flex items-center justify-center",
                                  filter.tone
                                )}
                              >
                                <Icon className="h-2.5 w-2.5" />
                              </span>
                              <span className="text-foreground/80">{filter.label}</span>
                              <span className="text-muted-foreground/50 group-hover:text-foreground/60 transition-colors">
                                ×
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Model list */}
                    <div className="px-2 pb-3 flex-1 min-h-0 overflow-y-auto scrollbar-w-1.5 scrollbar-thumb-border/40 hover:scrollbar-thumb-border/60 scrollbar-track-transparent scrollbar-thumb-rounded-full pr-1">
                      {currentModels.length === 0 && legacyModels.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
                          {/* Empty state icon - matches search box styling */}
                          <div className="h-12 w-12 rounded-xl bg-surface-1 border border-border/40 flex items-center justify-center">
                            <Search className="h-5 w-5 text-muted-foreground/50" />
                          </div>
                          <div className="space-y-1">
                            <span className="block text-sm font-medium text-foreground">
                              {showFavoritesEmpty
                                ? t("modelFavoritesEmptyTitle")
                                : t("modelEmptyTitle")}
                            </span>
                            <span className="block text-xs text-muted-foreground/70">
                              {showFavoritesEmpty
                                ? t("modelFavoritesEmptyBody")
                                : t("modelEmptyBody")}
                            </span>
                          </div>
                          {activeFilters.size > 0 && (
                            <button
                              type="button"
                              onClick={handleFilterClear}
                              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                              {t("modelFilterClear")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <List
                            variant="listbox"
                            enableKeyboardNav
                            onSelect={onSelect}
                            value={model}
                            className="gap-0.5"
                          >
                            {currentModels.map((entry) => (
                              <ModelListItem
                                key={entry.id}
                                model={entry}
                                isSelected={entry.id === model}
                                isFavorite={favoriteIds.has(entry.id)}
                                onSelect={onSelect}
                                onToggleFavorite={handleFavoriteToggle}
                                tagMeta={tagMeta}
                                features={featureDefinitions}
                                labels={actionLabels}
                              />
                            ))}
                          </List>

                          {legacyModels.length > 0 && (
                            <div className="mt-2 px-1">
                              <button
                                type="button"
                                onClick={() => setIsLegacyExpanded(!isLegacyExpanded)}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium",
                                  "text-muted-foreground/70 hover:bg-surface-2 hover:text-foreground transition-colors"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <Archive className="h-3.5 w-3.5" />
                                  <span>
                                    {legacyModels.length} {t("modelLegacyGroup")}
                                  </span>
                                </div>
                                <ChevronDown
                                  className={cn(
                                    "h-3.5 w-3.5 transition-transform duration-200",
                                    isLegacyExpanded ? "rotate-180" : ""
                                  )}
                                />
                              </button>

                              {isLegacyExpanded && (
                                <List
                                  variant="listbox"
                                  enableKeyboardNav
                                  onSelect={onSelect}
                                  value={model}
                                  className="gap-0.5 mt-1"
                                >
                                  {legacyModels.map((entry) => (
                                    <ModelListItem
                                      key={entry.id}
                                      model={entry}
                                      isSelected={entry.id === model}
                                      isFavorite={favoriteIds.has(entry.id)}
                                      onSelect={onSelect}
                                      onToggleFavorite={handleFavoriteToggle}
                                      tagMeta={tagMeta}
                                      features={featureDefinitions}
                                      labels={actionLabels}
                                    />
                                  ))}
                                </List>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

interface ModelListItemProps {
  model: ModelCapability;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (modelId: string) => void;
  onToggleFavorite: (modelId: string) => void;
  tagMeta: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
  >;
  features: FeatureDefinition[];
  labels: {
    favoriteAdd: string;
    favoriteRemove: string;
    detailOpen: string;
  };
  _index?: number;
}

function ModelListItem({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
  tagMeta,
  features,
  labels,
  _index,
}: ModelListItemProps) {
  const providerAccent = PROVIDER_ACCENTS[model.provider];
  const ProviderIcon = PROVIDER_ICONS[model.provider];
  const tags = model.tags.filter((tag) => tag in tagMeta).slice(0, 2);
  const labelParts = splitModelLabel(model.shortLabel || model.label);
  const modelFeatures = getModelFeatureSet(model);
  const featureIcons = features.filter((feature) => modelFeatures.has(feature.id)).slice(0, 4);

  return (
    // biome-ignore lint/a11y/useSemanticElements: custom option rendered inside virtual listbox
    <div
      role="option"
      id={_index !== undefined ? `list-item-${_index}` : undefined}
      aria-selected={isSelected}
      data-value={model.id}
      tabIndex={-1}
      onClick={() => onSelect(model.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(model.id);
        }
      }}
      className={cn(
        "group flex h-[68px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer",
        "transition-all duration-200 ease-out",
        "border border-transparent",
        "hover:bg-surface-2/50 hover:border-border/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        isSelected && "bg-surface-2/70 border-border/50 shadow-sm"
      )}
    >
      <span
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          "transition-transform duration-200 group-hover:scale-105",
          providerAccent.chip
        )}
      >
        <ProviderIcon className={cn("h-4.5 w-4.5", providerAccent.icon)} aria-hidden="true" />
      </span>

      <div className="flex flex-col min-w-0 flex-1 gap-1.5">
        {/* Row 1: Name + Tags + Actions */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate text-foreground">
              {labelParts.main}
            </span>
            {labelParts.suffix && (
              <span className="text-xs text-muted-foreground/60 truncate">
                ({labelParts.suffix})
              </span>
            )}

            {/* Tags moved to Row 1 */}
            <div className="flex items-center gap-1 shrink-0">
              {tags.map((tag) => {
                const meta = tagMeta[tag];
                const Icon = meta.icon;
                return (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                      "bg-surface-2 border border-border/40",
                      meta.tone.replace("bg-", "text-")
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {meta.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <Tooltip
              content={isFavorite ? labels.favoriteRemove : labels.favoriteAdd}
              side="top"
              align="center"
              sideOffset={6}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleFavorite(model.id);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className={cn(
                  "h-6 w-6 rounded-md flex items-center justify-center",
                  "transition-all duration-200 ease-out",
                  "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  isFavorite && "text-accent-amber hover:text-accent-amber"
                )}
                aria-label={isFavorite ? labels.favoriteRemove : labels.favoriteAdd}
              >
                <Star
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isFavorite && "fill-current scale-110"
                  )}
                />
              </button>
            </Tooltip>

            <Tooltip
              content={<ModelDetail model={model} tagMeta={tagMeta} features={features} />}
              side="left"
              align="start"
              sideOffset={12}
              className="w-[320px] p-0 whitespace-normal"
            >
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className={cn(
                  "h-6 w-6 rounded-md flex items-center justify-center",
                  "transition-all duration-200 ease-out",
                  "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                )}
                aria-label={labels.detailOpen}
              >
                <Info className="h-3 w-3" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Row 2: Features + Description */}
        <div className="flex items-center gap-2 min-w-0 text-[10px] text-muted-foreground/80 h-5">
          {featureIcons.length > 0 && (
            <>
              <div className="flex items-center gap-0.5 shrink-0">
                {featureIcons.map((feature) => (
                  <FeatureIcon key={feature.id} feature={feature} />
                ))}
              </div>
              <div className="w-px h-3 bg-border/40 shrink-0" />
            </>
          )}

          {model.description && <span className="truncate flex-1">{model.description}</span>}
        </div>
      </div>
    </div>
  );
}

function FeatureIcon({ feature }: { feature: FeatureDefinition }) {
  const Icon = feature.icon;
  return (
    <Tooltip content={feature.label} side="top" align="center" sideOffset={6}>
      <span
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center", // Compact size
          "border border-border/40 bg-surface-1",
          feature.tone
        )}
        aria-hidden="true"
      >
        <Icon className="h-2.5 w-2.5" />
      </span>
    </Tooltip>
  );
}

function ModelDetail({
  model,
  tagMeta,
  features,
}: {
  model: ModelCapability;
  tagMeta: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
  >;
  features: FeatureDefinition[];
}) {
  const t = useTranslations("AIPanel");
  const providerAccent = PROVIDER_ACCENTS[model.provider];
  const ProviderIcon = PROVIDER_ICONS[model.provider];
  const providerLabel =
    model.provider === "gemini" ? t("modelProviderGoogle") : t("modelProviderAnthropic");
  const tags = model.tags.filter((tag) => tag in tagMeta);
  const modelFeatures = getModelFeatureSet(model);
  const featureIcons = features.filter((feature) => modelFeatures.has(feature.id));

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            "bg-linear-to-br",
            providerAccent.chip
          )}
        >
          <ProviderIcon className={cn("h-4 w-4", providerAccent.icon)} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {model.shortLabel || model.label}
          </div>
          {model.description && (
            <div className="text-xs text-muted-foreground mt-1">{model.description}</div>
          )}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const meta = tagMeta[tag];
            const Icon = meta.icon;
            return (
              <span
                key={tag}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                  meta.tone
                )}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {t("modelDetailCapabilities")}
        </span>
        <div className="flex flex-wrap gap-2">
          {featureIcons.map((feature) => {
            const Icon = feature.icon;
            return (
              <span
                key={feature.id}
                className={cn(
                  "px-2 py-1 rounded-full text-[11px] flex items-center gap-1",
                  feature.tone
                )}
              >
                <Icon className="h-3 w-3" />
                {feature.label}
              </span>
            );
          })}
          {featureIcons.length === 0 && (
            <span className="text-xs text-muted-foreground">{t("modelEmptyBody")}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {t("modelDetailProvider")}
          </span>
          <span className="font-medium text-foreground">{providerLabel}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {t("modelDetailContextWindow")}
          </span>
          <span className="font-medium text-foreground">
            {formatContextWindow(model.contextWindow)}
          </span>
        </div>
      </div>
    </div>
  );
}
