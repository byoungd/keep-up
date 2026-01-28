"use client";

import { type ModelCapability, normalizeModelId } from "@ku0/ai-core";
import { cn } from "@ku0/shared/utils";
import {
  Brain,
  ChevronDown,
  Eye,
  FileText,
  Filter,
  Image,
  Info,
  LayoutGrid,
  Search,
  Settings,
  Star,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
// import { useTranslations } from "next-intl"; // Removed next-intl dependency
import * as React from "react";
import { useShellTranslations } from "../../hooks/useShellTranslations";
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

export type PanelPosition = "left" | "right" | "main";

export interface ModelSelectorProps {
  model: string;
  models: ModelCapability[];
  onSelect: (modelId: string) => void;
  className?: string;
  /** Which side of the screen this selector lives in. Affects tooltip/dropdown directions. */
  panelPosition?: PanelPosition;
}

const FAVORITES_STORAGE_KEY = "ai-model-favorites-v1";

export type ProviderFilter =
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
export type FeatureId =
  | "fast"
  | "vision"
  | "effort"
  | "toolCalling"
  | "imageGeneration"
  | "nativePDFs"
  | "video";

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

export type ModelView = {
  id: string;
  model: ModelCapability;
  providerLabel: string;
  searchText: string;
  featureMask: number;
  mainLabel: string;
  suffixLabel: string;
  contextLabel: string;
};

export const FEATURE_MASK: Record<FeatureId, number> = {
  fast: 1 << 0,
  vision: 1 << 1,
  effort: 1 << 2,
  toolCalling: 1 << 3,
  imageGeneration: 1 << 4,
  nativePDFs: 1 << 5,
  video: 1 << 6,
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
  ollama: {
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
  ollama: OpenAIIcon, // Use OpenAI icon as fallback for Ollama
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

const getModelFeatureMask = (model: ModelCapability) => {
  let mask = 0;

  if (model.tags.includes("fast")) {
    mask |= FEATURE_MASK.fast;
  }
  if (model.supports.vision) {
    mask |= FEATURE_MASK.vision;
  }
  // Map both 'thinking' and 'reasoning' to the 'effort' (Thinking) feature
  if (
    model.supports.thinking ||
    model.tags.includes("thinking") ||
    model.tags.includes("reasoning")
  ) {
    mask |= FEATURE_MASK.effort;
  }
  if (model.supports.tools) {
    mask |= FEATURE_MASK.toolCalling;
  }
  if (model.id.includes("image")) {
    mask |= FEATURE_MASK.imageGeneration;
  }
  if (model.tags.includes("pdf")) {
    mask |= FEATURE_MASK.nativePDFs;
  }
  if (model.tags.includes("video") || model.id.includes("video")) {
    mask |= FEATURE_MASK.video;
  }

  return mask;
};

const buildSearchText = (model: ModelCapability, providerLabel: string) =>
  [
    model.label,
    model.shortLabel,
    model.description,
    model.group,
    providerLabel,
    model.tags.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

type FilterModelViewsInput = {
  modelViews: ModelView[];
  activeProvider: ProviderFilter;
  favoriteIds: Set<string>;
  searchTokens: string[];
  activeFilterMask: number;
  matchAllFilters: boolean;
};

const matchesProviderFilter = (
  entry: ModelView,
  activeProvider: ProviderFilter,
  favoriteIds: Set<string>
) => {
  if (activeProvider === "favorites") {
    return favoriteIds.has(entry.id);
  }

  if (activeProvider === "all") {
    return true;
  }

  const activeModelProvider = PROVIDER_TO_MODEL_PROVIDER[activeProvider];
  return Boolean(activeModelProvider && entry.model.provider === activeModelProvider);
};

const matchesSearchTokens = (entry: ModelView, searchTokens: string[]) => {
  if (searchTokens.length === 0) {
    return true;
  }

  for (const token of searchTokens) {
    if (!entry.searchText.includes(token)) {
      return false;
    }
  }

  return true;
};

const matchesFeatureMask = (
  entry: ModelView,
  activeFilterMask: number,
  matchAllFilters: boolean
) => {
  if (activeFilterMask === 0) {
    return true;
  }

  if (matchAllFilters) {
    return (entry.featureMask & activeFilterMask) === activeFilterMask;
  }

  return (entry.featureMask & activeFilterMask) !== 0;
};

export const filterModelViews = ({
  modelViews,
  activeProvider,
  favoriteIds,
  searchTokens,
  activeFilterMask,
  matchAllFilters,
}: FilterModelViewsInput) => {
  const current: ModelView[] = [];
  const legacy: ModelView[] = [];

  for (const entry of modelViews) {
    if (!matchesProviderFilter(entry, activeProvider, favoriteIds)) {
      continue;
    }

    if (!matchesSearchTokens(entry, searchTokens)) {
      continue;
    }

    if (!matchesFeatureMask(entry, activeFilterMask, matchAllFilters)) {
      continue;
    }

    if (entry.model.legacy) {
      legacy.push(entry);
    } else {
      current.push(entry);
    }
  }

  return { currentModels: current, legacyModels: legacy };
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex UI component with multiple interactive states
export function ModelSelector({
  model,
  models,
  onSelect,
  className,
  panelPosition = "main",
}: ModelSelectorProps) {
  // const t = useTranslations("AIPanel");
  const t = useShellTranslations("AIPanel");
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [activeProvider, setActiveProvider] = React.useState<ProviderFilter>("all");
  const [activeFilters, setActiveFilters] = React.useState<Set<FeatureId>>(new Set());
  const matchAllFilters = false;
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());
  const [settingsMode, setSettingsMode] = React.useState(false);
  const [hoveredModelId, setHoveredModelId] = React.useState<string | null>(null);
  // Reset settings mode when closing
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setSettingsMode(false);
      setHoveredModelId(null);
    }
  };
  const [isLegacyExpanded, setIsLegacyExpanded] = React.useState(false);

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
      ollama: "Ollama",
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
      {
        id: "video",
        label: t("modelFeatureVideo"),
        icon: Video,
        tone: "bg-surface-2/80 text-muted-foreground",
      },
    ],
    [t]
  );

  const activeFilterMask = React.useMemo(() => {
    let mask = 0;
    for (const filter of activeFilters) {
      mask |= FEATURE_MASK[filter];
    }
    return mask;
  }, [activeFilters]);

  const modelViews = React.useMemo<ModelView[]>(
    () =>
      models.map((entry) => {
        const providerLabel = modelProviderLabels[entry.provider] ?? entry.provider;
        const { main, suffix } = splitModelLabel(entry.label);

        return {
          id: entry.id,
          model: entry,
          providerLabel,
          searchText: buildSearchText(entry, providerLabel),
          featureMask: getModelFeatureMask(entry),
          mainLabel: main,
          suffixLabel: suffix,
          contextLabel: formatContextWindow(entry.contextWindow),
        };
      }),
    [models, modelProviderLabels]
  );

  const modelViewById = React.useMemo(() => {
    const viewById = new Map<string, ModelView>();
    for (const view of modelViews) {
      viewById.set(view.id, view);
    }
    return viewById;
  }, [modelViews]);

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

  const selectedView = React.useMemo(() => {
    const direct = modelViewById.get(model);
    if (direct) {
      return direct;
    }

    const migratedId = normalizeModelId(model);
    if (migratedId) {
      return modelViewById.get(migratedId) ?? null;
    }

    return null;
  }, [modelViewById, model]);

  const selectedLabel = React.useMemo(() => {
    if (selectedView) {
      return selectedView.model.shortLabel || selectedView.model.label;
    }

    return model
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }, [selectedView, model]);

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const searchTokens = React.useMemo(
    () => normalizedSearch.split(/\s+/).filter(Boolean),
    [normalizedSearch]
  );

  const { currentModels, legacyModels } = React.useMemo(
    () =>
      filterModelViews({
        modelViews,
        activeProvider,
        favoriteIds,
        searchTokens,
        activeFilterMask,
        matchAllFilters,
      }),
    [modelViews, activeProvider, favoriteIds, searchTokens, activeFilterMask]
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

  const handleSelectModel = React.useCallback(
    (modelId: string) => {
      onSelect(modelId);
    },
    [onSelect]
  );

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
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="compact"
          className={cn(
            "group flex items-center gap-1.5 px-2 py-0.5 h-auto text-left rounded-md transition-all duration-slow",
            // Default side view: standard pill
            panelPosition !== "main" &&
              "h-10 px-2 rounded-xl bg-surface-2/10 hover:bg-surface-2/60 hover:shadow-sm",
            // Main/Toolbar view: minimal ghost
            panelPosition === "main" &&
              "text-muted-foreground hover:text-foreground hover:bg-surface-2",
            "data-[state=open]:bg-surface-2 data-[state=open]:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-primary/20",
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {selectedView && (
              <div
                className={cn(
                  "flex items-center justify-center shrink-0",
                  // Main: simplified icon
                  panelPosition === "main"
                    ? "h-4 w-4"
                    : "h-7 w-7 rounded-lg transition-all duration-normal group-hover:scale-105 group-data-[state=open]:scale-105",
                  panelPosition !== "main" && PROVIDER_ACCENTS[selectedView.model.provider].chip
                )}
              >
                {React.createElement(PROVIDER_ICONS[selectedView.model.provider], {
                  className: cn(
                    panelPosition === "main" ? "h-3.5 w-3.5" : "h-3.5 w-3.5",
                    panelPosition !== "main" && PROVIDER_ACCENTS[selectedView.model.provider].icon
                  ),
                  "aria-hidden": true,
                })}
              </div>
            )}
            <div className="flex flex-col items-start leading-none gap-0.5">
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className={cn(
                    "font-medium truncate max-w-[140px]",
                    panelPosition === "main" ? "text-xs" : "text-sm text-foreground"
                  )}
                >
                  {selectedLabel}
                </span>
                <ChevronDown
                  className={cn(
                    "text-muted-foreground/50 transition-transform duration-slow",
                    panelPosition === "main" ? "h-3 w-3" : "h-3.5 w-3.5",
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
          "w-[540px] max-w-[calc(100vw-24px)] p-0 rounded-2xl overflow-hidden",
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
                          "transition-all duration-normal ease-out",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border/40",
                          isDisabled && "opacity-20 cursor-not-allowed",
                          isActive
                            ? "bg-surface-2 text-foreground"
                            : "text-muted-foreground/50 hover:bg-surface-2/60 hover:text-foreground"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 transition-colors duration-normal",
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
                    aria-label={settingsMode ? t("modelBackToModels") : t("modelProviderSettings")}
                    onClick={() => setSettingsMode(!settingsMode)}
                    className={cn(
                      "group relative h-11 w-11 rounded-xl flex items-center justify-center transition-all duration-slow",
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
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
                        // biome-ignore lint/suspicious/noExplicitAny: Provider ID type mismatch
                        providerId={activeProvider as any}
                        onBack={() => setActiveProvider("all")}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Search header */}
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2",
                        "border-b border-border/40",
                        "transition-all duration-normal group/search"
                      )}
                    >
                      <Search
                        className="h-4 w-4 text-muted-foreground/40 group-focus-within/search:text-primary/60 transition-colors duration-fast"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search models..."
                        aria-label="Search models"
                        className="flex-1 bg-transparent border-none p-0 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch("")}
                          className="p-1 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-surface-3 transition-colors duration-fast"
                        >
                          <span className="sr-only">Clear search</span>
                          <div className="h-3.5 w-3.5 rounded-full bg-current opacity-70" />
                        </button>
                      )}
                    </div>

                    {/* Feature filters - Compact Single Line */}
                    <div
                      className="flex items-center gap-1 overflow-x-auto py-2.5 px-3 scrollbar-none snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-b border-border/20 bg-surface-1/30"
                      // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
                      tabIndex={0}
                    >
                      {featureDefinitions.map((feature) => {
                        const isActive = activeFilters.has(feature.id);
                        const Icon = feature.icon;

                        return (
                          <button
                            key={feature.id}
                            type="button"
                            onClick={() => handleFilterToggle(feature.id)}
                            className={cn(
                              "shrink-0 snap-start flex items-center gap-1 px-1.5 py-1 rounded-full text-micro tracking-tight font-medium border transition-all duration-normal",
                              isActive
                                ? "bg-primary/10 border-primary/20 text-primary shadow-sm"
                                : "bg-surface-1/50 border-border/10 text-muted-foreground/70 hover:bg-surface-2 hover:text-foreground hover:border-border/30"
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
                  <div
                    className="flex-1 overflow-y-auto scrollbar-auto-hide min-h-0 p-2 space-y-1"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
                    tabIndex={0}
                  >
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
                            const selected = currentModels.find((entry) => entry.id === value);
                            if (selected) {
                              handleSelectModel(selected.id);
                            }
                          }}
                        >
                          {currentModels.map((entry) => (
                            <DropdownMenuItem
                              key={entry.id}
                              className="gap-2 cursor-pointer"
                              data-value={entry.id}
                              onSelect={() => handleSelectModel(entry.id)}
                              onPointerEnter={() => setHoveredModelId(entry.id)}
                              onPointerLeave={() =>
                                setHoveredModelId((prev) => (prev === entry.id ? null : prev))
                              }
                              onFocus={() => setHoveredModelId(entry.id)}
                              onBlur={() =>
                                setHoveredModelId((prev) => (prev === entry.id ? null : prev))
                              }
                              asChild
                            >
                              <ModelItem
                                view={entry}
                                isSelected={entry.id === model}
                                isHovered={hoveredModelId === entry.id}
                                isFavorite={favoriteIds.has(entry.id)}
                                onToggleFavorite={handleFavoriteToggle}
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
                              className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-fast w-full"
                            >
                              <ChevronDown
                                className={cn(
                                  "h-3 w-3 transition-transform duration-fast",
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
                                    const selected = legacyModels.find(
                                      (entry) => entry.id === value
                                    );
                                    if (selected) {
                                      handleSelectModel(selected.id);
                                    }
                                  }}
                                >
                                  {legacyModels.map((entry) => (
                                    <DropdownMenuItem
                                      key={entry.id}
                                      className="gap-2 cursor-pointer"
                                      data-value={entry.id}
                                      onClick={() => handleSelectModel(entry.id)}
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <div className="shrink-0 text-muted-foreground">
                                          {entry.model.provider === "openai" && (
                                            <Brain className="h-4 w-4" />
                                          )}
                                          {entry.model.provider === "claude" && (
                                            <Brain className="h-4 w-4" />
                                          )}
                                          {entry.model.provider === "gemini" && (
                                            <Brain className="h-4 w-4" />
                                          )}
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">
                                              {entry.model.label}
                                            </span>
                                            <span className="text-xs text-muted-foreground shrink-0 border px-1 rounded">
                                              {entry.providerLabel}
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
  );
}

// Sub-components to keep clean
interface ModelItemProps {
  view: ModelView;
  isSelected: boolean;
  isHovered: boolean;
  isFavorite: boolean;
  onToggleFavorite: (modelId: string) => void;
  labels: { favoriteAdd: string; favoriteRemove: string; detailOpen: string };
  variant?: "default" | "legacy";
}

const ModelItem = React.memo(function ModelItem({
  view,
  isSelected,
  isHovered,
  isFavorite,
  onToggleFavorite,
  labels,
  variant = "default",
}: ModelItemProps) {
  const { model, mainLabel, suffixLabel, contextLabel, providerLabel } = view;
  const isLegacy = variant === "legacy";
  const showActions = isSelected || isHovered;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors duration-normal cursor-pointer w-full text-left",
        isSelected
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-surface-2/50 hover:text-foreground",
        isLegacy && "opacity-70 hover:opacity-100"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "h-6 w-6 rounded flex items-center justify-center shrink-0 transition-colors duration-fast",
          isSelected ? "bg-background shadow-none" : "bg-surface-2/50 group-hover:bg-background"
        )}
      >
        {React.createElement(PROVIDER_ICONS[model.provider], {
          className: cn(
            "h-3.5 w-3.5",
            isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
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
              {mainLabel}
            </span>
            {model.supports.thinking && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-tiny font-medium bg-accent-indigo/10 text-accent-indigo border border-accent-indigo/20">
                <Brain className="h-2.5 w-2.5" />
                Think
              </span>
            )}
            {!isLegacy && suffixLabel && (
              <span className="text-micro text-muted-foreground/60 truncate max-w-[80px]">
                {suffixLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-fine text-muted-foreground/60">
          <span className="truncate">{providerLabel}</span>
          <span className="text-border/40">|</span>
          <span>{contextLabel}</span>
          {/* Cost logic removed */}
        </div>
      </div>

      {/* Actions (visible on hover/focus/selected) */}
      {showActions && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pl-2 bg-gradient-to-l from-surface-2 via-surface-2 to-transparent">
          <Tooltip content={isFavorite ? labels.favoriteRemove : labels.favoriteAdd}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(view.id);
              }}
              aria-label={isFavorite ? labels.favoriteRemove : labels.favoriteAdd}
              className={cn(
                "p-1.5 rounded-lg transition-colors duration-fast",
                isFavorite
                  ? "text-warning hover:text-warning hover:bg-warning/10"
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
              aria-label={labels.detailOpen}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-surface-3 transition-colors duration-fast"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
});
