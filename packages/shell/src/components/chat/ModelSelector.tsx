"use client";

import { type ModelCapability, normalizeModelId } from "@ku0/ai-core";
import { cn } from "@ku0/shared/utils";
import {
  Brain,
  ChevronDown,
  Eye,
  Feather,
  FileText,
  Filter,
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
// import { useTranslations } from "next-intl"; // Removed next-intl dependency
import * as React from "react";
import { Button } from "../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { List } from "../ui/List";
import { Tooltip } from "../ui/Tooltip";
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

import { useShellTranslations } from "../../hooks/useShellTranslations";

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
  // const t = useTranslations("AIPanel");
  const t = useShellTranslations("AIPanel");
  const [search, setSearch] = React.useState("");
  const [activeProvider, setActiveProvider] = React.useState<ProviderFilter>("all");
  const [activeFilters, setActiveFilters] = React.useState<Set<FeatureId>>(new Set());
  const [matchAllFilters] = React.useState(false); // setMatchAllFilters unused
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

  const _tagMeta = React.useMemo(
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

  const _activeFilterDetails = React.useMemo(
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
                          "bg-surface-1/50 border border-border/20",
                          "focus-within:bg-surface-2 focus-within:border-primary/20 focus-within:ring-2 focus-within:ring-primary/10",
                          "transition-all duration-200 group/search"
                        )}
                      >
                        <Search
                          className="h-4 w-4 text-muted-foreground/40 group-focus-within/search:text-primary/60 transition-colors"
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search models... (e.g. 'claude', 'vision', 'fast')"
                          className="flex-1 bg-transparent border-none p-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
                        />
                        {search && (
                          <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="p-1 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-surface-3 transition-colors"
                          >
                            <span className="sr-only">Clear search</span>
                            <div className="h-3.5 w-3.5 rounded-full bg-current opacity-70" />
                          </button>
                        )}
                      </div>

                      {/* Feature filters */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {availableFilters.length > 0 &&
                          featureDefinitions.map((feature) => {
                            if (!availableFilters.some((f) => f.id === feature.id)) {
                              return null;
                            }
                            const isActive = activeFilters.has(feature.id);
                            const Icon = feature.icon;

                            return (
                              <button
                                key={feature.id}
                                type="button"
                                onClick={() => handleFilterToggle(feature.id)}
                                className={cn(
                                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all duration-200",
                                  isActive
                                    ? "bg-primary/10 border-primary/20 text-primary"
                                    : "bg-surface-1 border-border/20 text-muted-foreground/60 hover:border-border/40 hover:text-muted-foreground"
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {feature.label}
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    {/* Model list */}
                    <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
                      {showFavoritesEmpty ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/50">
                          <Star className="h-8 w-8 mb-3 opacity-20" />
                          <p className="text-sm">No favorite models yet</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-primary/60 h-auto p-0 mt-2 text-xs"
                            onClick={() => setActiveProvider("all")}
                          >
                            Browse all models
                          </Button>
                        </div>
                      ) : currentModels.length === 0 && legacyModels.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/50">
                          <Filter className="h-8 w-8 mb-3 opacity-20" />
                          <p className="text-sm">No models match your filters</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-primary/60 h-auto p-0 mt-2 text-xs"
                            onClick={handleFilterClear}
                          >
                            Clear filters
                          </Button>
                        </div>
                      ) : (
                        <>
                          <List
                            className="space-y-1"
                            onSelect={(value) => {
                              const model = currentModels.find((m) => m.id === value);
                              if (model) {
                                onSelect(model.id);
                              }
                            }}
                          >
                            {currentModels.map((entry) => (
                              <DropdownMenuItem
                                key={entry.id}
                                className="gap-2 cursor-pointer"
                                onClick={() => onSelect(entry.id)}
                              >
                                <ModelItem
                                  model={entry}
                                  isSelected={entry.id === model}
                                  isFavorite={favoriteIds.has(entry.id)}
                                  onSelect={() => onSelect(entry.id)}
                                  onToggleFavorite={() => handleFavoriteToggle(entry.id)}
                                  providerName={modelProviderLabels[entry.provider]}
                                  labels={actionLabels}
                                />
                              </DropdownMenuItem>
                            ))}
                          </List>

                          {legacyModels.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border/20">
                              <button
                                type="button"
                                onClick={() => setIsLegacyExpanded(!isLegacyExpanded)}
                                className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors w-full"
                              >
                                <ChevronDown
                                  className={cn(
                                    "h-3 w-3 transition-transform",
                                    isLegacyExpanded ? "rotate-0" : "-rotate-90"
                                  )}
                                />
                                Legacy Models ({legacyModels.length})
                              </button>
                              {isLegacyExpanded && (
                                <div className="mt-2 space-y-1">
                                  <List
                                    className="p-1"
                                    onSelect={(value) => {
                                      const model = legacyModels.find((m) => m.id === value);
                                      if (model) {
                                        onSelect(model.id);
                                      }
                                    }}
                                  >
                                    {legacyModels.map((entry) => (
                                      <DropdownMenuItem
                                        key={entry.id}
                                        className="gap-2 cursor-pointer"
                                        onClick={() => onSelect(entry.id)}
                                      >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <div className="shrink-0 text-muted-foreground">
                                            {entry.provider === "openai" && (
                                              <Brain className="h-4 w-4" />
                                            )}
                                            {entry.provider === "claude" && (
                                              <Brain className="h-4 w-4" />
                                            )}
                                            {entry.provider === "gemini" && (
                                              <Brain className="h-4 w-4" />
                                            )}
                                          </div>
                                          <div className="flex flex-col overflow-hidden">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium truncate">
                                                {entry.label}
                                              </span>
                                              <span className="text-xs text-muted-foreground shrink-0 border px-1 rounded">
                                                {modelProviderLabels[entry.provider]}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </DropdownMenuItem>
                                    ))}
                                  </List>
                                </div>
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

// Sub-components to keep clean
interface ModelItemProps {
  model: ModelCapability;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  providerName: string;
  labels: { favoriteAdd: string; favoriteRemove: string; detailOpen: string };
  variant?: "default" | "legacy";
}

function ModelItem({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
  providerName,
  labels,
  variant = "default",
}: ModelItemProps) {
  const { main, suffix } = splitModelLabel(model.label);
  const isLegacy = variant === "legacy";

  return (
    <button
      type="button"
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer w-full text-left",
        isSelected
          ? "bg-surface-2 shadow-sm ring-1 ring-border/50"
          : "hover:bg-surface-2/50 hover:shadow-sm hover:ring-1 hover:ring-border/20",
        isLegacy && "opacity-70 hover:opacity-100"
      )}
      onClick={onSelect}
    >
      {/* Icon */}
      <div
        className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
          isSelected
            ? PROVIDER_ACCENTS[model.provider].chip
            : "bg-surface-1 border-border/20 group-hover:border-border/40"
        )}
      >
        {React.createElement(PROVIDER_ICONS[model.provider], {
          className: cn(
            "h-4.5 w-4.5",
            isSelected ? PROVIDER_ACCENTS[model.provider].icon : "text-muted-foreground"
          ),
          "aria-hidden": true,
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "text-sm font-medium truncate",
                isSelected ? "text-foreground" : "text-foreground/80"
              )}
            >
              {main}
            </span>
            {model.supports.thinking && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                <Brain className="h-2.5 w-2.5" />
                Think
              </span>
            )}
            {!isLegacy && suffix && (
              <span className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">
                {suffix}
              </span>
            )}
          </div>
          {isSelected && (
            <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm shadow-primary/20 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <span className="truncate">{providerName}</span>
          <span className="text-border/40">|</span>
          <span>{formatContextWindow(model.contextWindow)}</span>
          {/* Cost logic removed */}
        </div>
      </div>

      {/* Actions (visible on hover/focus/selected) */}
      <div
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pl-2 bg-gradient-to-l from-surface-2 via-surface-2 to-transparent",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          isSelected && "opacity-100"
        )}
      >
        <Tooltip content={isFavorite ? labels.favoriteRemove : labels.favoriteAdd}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              isFavorite
                ? "text-amber-400 hover:text-amber-500 hover:bg-amber-500/10"
                : "text-muted-foreground/40 hover:text-foreground hover:bg-surface-3"
            )}
          >
            <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
          </button>
        </Tooltip>

        <Tooltip content={labels.detailOpen}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // Open detail view (not implemented in this simplified version yet)
            }}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-surface-3 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </button>
  );
}
