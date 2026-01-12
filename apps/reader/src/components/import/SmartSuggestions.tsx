"use client";

/**
 * SmartSuggestions - Linear-style AI suggestions
 *
 * Design Philosophy:
 * - Minimal visual weight
 * - Subtle hover states with precise timing
 * - AI research panel as progressive disclosure
 * - Keyboard-accessible interactions
 */

import { cn } from "@/lib/utils";
import type { DocumentRow, TopicRow } from "@keepup/db";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Lightbulb, Loader2, Search, Sparkles, TrendingUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAIResearch } from "../../hooks/useAIResearch";
import { useDocuments } from "../../hooks/useDocuments";
import { useTopics } from "../../hooks/useTopics";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

export interface Suggestion {
  id: string;
  type: "topic" | "related" | "trending";
  title: string;
  description?: string;
  url?: string;
  icon: "topic" | "related" | "trending";
}

interface SmartSuggestionsProps {
  onSelectSuggestion: (suggestion: Suggestion) => void;
  className?: string;
}

// Linear-style spring: snappy and responsive
const SPRING = { type: "spring", stiffness: 500, damping: 35 } as const;

// Default topics for cold start
const TRENDING_TOPICS: Suggestion[] = [
  {
    id: "trend-1",
    type: "trending",
    title: "React Server Components",
    description: "RSC patterns & best practices",
    icon: "trending",
  },
  {
    id: "trend-2",
    type: "trending",
    title: "TypeScript 5.x",
    description: "New language features",
    icon: "trending",
  },
  {
    id: "trend-3",
    type: "trending",
    title: "AI Development",
    description: "Prompting & integration",
    icon: "trending",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function deriveTopicsFromDocuments(documents: DocumentRow[]): Suggestion[] {
  const titleWords = new Map<string, number>();

  for (const doc of documents) {
    if (!doc.title) {
      continue;
    }
    const words = doc.title
      .split(/[\s\-_:]+/)
      .filter((w) => w.length > 3)
      .map((w) => w.toLowerCase());

    for (const word of words) {
      titleWords.set(word, (titleWords.get(word) ?? 0) + 1);
    }
  }

  return [...titleWords.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word], index) => ({
      id: `derived-${index}`,
      type: "related" as const,
      title: word.charAt(0).toUpperCase() + word.slice(1),
      description: "From reading history",
      icon: "related" as const,
    }));
}

function topicsToSuggestions(topics: TopicRow[]): Suggestion[] {
  return topics.slice(0, 3).map((topic) => ({
    id: `topic-${topic.topicId}`,
    type: "topic" as const,
    title: topic.name,
    description: "Your project",
    icon: "topic" as const,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion Icon
// ─────────────────────────────────────────────────────────────────────────────

function SuggestionIcon({ type }: { type: Suggestion["icon"] }) {
  const iconClass = "w-3.5 h-3.5";
  switch (type) {
    case "topic":
      return <BookOpen className={iconClass} aria-hidden="true" />;
    case "related":
      return <Lightbulb className={iconClass} aria-hidden="true" />;
    case "trending":
      return <TrendingUp className={iconClass} aria-hidden="true" />;
    default:
      return <Sparkles className={iconClass} aria-hidden="true" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion Row
// ─────────────────────────────────────────────────────────────────────────────

interface SuggestionRowProps {
  suggestion: Suggestion;
  onSelect: () => void;
  onResearch: () => void;
  index: number;
}

function SuggestionRow({ suggestion, onSelect, onResearch, index }: SuggestionRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -6 }}
      transition={{ ...SPRING, delay: index * 0.03 }}
      className={cn(
        "group flex items-center gap-2.5 px-2 py-2 -mx-1 rounded-md",
        "hover:bg-surface-1/80 transition-colors duration-150"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-6 h-6 rounded flex items-center justify-center shrink-0",
          suggestion.type === "topic" && "bg-primary/10 text-primary",
          suggestion.type === "related" && "bg-amber-500/10 text-amber-500",
          suggestion.type === "trending" && "bg-emerald-500/10 text-emerald-500"
        )}
      >
        <SuggestionIcon type={suggestion.icon} />
      </div>

      {/* Content */}
      <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left">
        <span className="text-[13px] font-medium text-foreground/90 group-hover:text-foreground transition-colors">
          {suggestion.title}
        </span>
        {suggestion.description && (
          <span className="text-[11px] text-muted-foreground/50 ml-2">
            {suggestion.description}
          </span>
        )}
      </button>

      {/* Research action */}
      <button
        type="button"
        onClick={onResearch}
        className={cn(
          "p-1.5 rounded opacity-0 group-hover:opacity-100",
          "text-muted-foreground/50 hover:text-primary hover:bg-primary/10",
          "transition-all duration-150"
        )}
        aria-label={`Research ${suggestion.title}`}
      >
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Research Panel
// ─────────────────────────────────────────────────────────────────────────────

interface ResearchPanelProps {
  topic: string;
  content: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

function ResearchPanel({ topic, content, isLoading, error, onClose }: ResearchPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="rounded-lg bg-surface-1/50 border border-border/50 p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            )}
            <span className="text-[12px] font-medium text-foreground">{topic}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 transition-colors"
            aria-label="Close research"
          >
            <X className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        {/* Error */}
        {error && <p className="text-[11px] text-red-500">{error}</p>}

        {/* Content */}
        {content && (
          <div
            className="text-[12px] text-muted-foreground/80 leading-relaxed max-h-[160px] overflow-y-auto"
            /* biome-ignore lint/a11y/noNoninteractiveTabindex: Allow keyboard focus for scrollable content. */
            tabIndex={0}
          >
            {content}
          </div>
        )}

        {/* Loading state */}
        {isLoading && !content && (
          <p className="text-[11px] text-muted-foreground/60">Researching topic...</p>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SmartSuggestions({ onSelectSuggestion, className }: SmartSuggestionsProps) {
  const t = useTranslations("Import");
  const { documents, loading: docsLoading } = useDocuments({ limit: 20, autoRefresh: false });
  const { topics, loading: topicsLoading } = useTopics({ limit: 5 });
  const [isVisible, setIsVisible] = useState(false);

  // AI Research state
  const [researchTopic, setResearchTopic] = useState<string | null>(null);
  const {
    research,
    abort,
    content: researchContent,
    isResearching,
    error: researchError,
  } = useAIResearch();

  // Delay visibility for smooth appearance
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Generate suggestions
  const suggestions = useMemo(() => {
    const result: Suggestion[] = [];

    if (topics.length > 0) {
      result.push(...topicsToSuggestions(topics));
    }

    if (documents.length > 0) {
      result.push(...deriveTopicsFromDocuments(documents));
    }

    if (result.length < 3) {
      result.push(...TRENDING_TOPICS.slice(0, 3 - result.length));
    }

    return result.slice(0, 4);
  }, [documents, topics]);

  const handleSelect = useCallback(
    (suggestion: Suggestion) => {
      onSelectSuggestion(suggestion);
    },
    [onSelectSuggestion]
  );

  const handleResearch = useCallback(
    (suggestion: Suggestion) => {
      setResearchTopic(suggestion.title);
      research(suggestion.title);
    },
    [research]
  );

  const handleCloseResearch = useCallback(() => {
    abort();
    setResearchTopic(null);
  }, [abort]);

  const isLoading = docsLoading || topicsLoading;

  if (!isVisible) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn("space-y-2", className)}
    >
      {/* AI Research Panel */}
      <AnimatePresence>
        {researchTopic && (
          <ResearchPanel
            topic={researchTopic}
            content={researchContent}
            isLoading={isResearching}
            error={researchError}
            onClose={handleCloseResearch}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
          {t("suggestions") ?? "Suggestions"}
        </span>
        {isLoading && <Loader2 className="w-3 h-3 text-muted-foreground/40 animate-spin" />}
      </div>

      {/* Suggestion List */}
      <div className="-mx-1">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion, index) => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              onSelect={() => handleSelect(suggestion)}
              onResearch={() => handleResearch(suggestion)}
              index={index}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
