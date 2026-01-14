"use client";

import { Button } from "@/components/ui/Button";
import { TOPIC_BUNDLES } from "@/lib/feeds/topicBundles";
import { cn } from "@ku0/shared/utils";
import { Atom, Brain, Briefcase, Check, Cloud, Database, Layout, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

const ICONS: Record<string, React.ElementType> = {
  Atom,
  Brain,
  Cloud,
  Layout,
  Database,
  Briefcase,
};

interface TopicSelectorProps {
  onSelect: (topicIds: string[]) => void;
  isLoading?: boolean;
}

export function TopicSelector({ onSelect, isLoading }: TopicSelectorProps) {
  const [selectedTopics, setSelectedTopics] = React.useState<Set<string>>(new Set());
  const t = useTranslations("Onboarding");

  const toggleTopic = (id: string) => {
    const next = new Set(selectedTopics);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTopics(next);
  };

  const handleContinue = () => {
    onSelect(Array.from(selectedTopics));
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8 space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {t("chooseTopicsTitle", { defaultMessage: "What defines your role?" })}
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {t("chooseTopicsSubtitle", {
            defaultMessage:
              "We'll curate a high-signal briefing for you based on your interests. No more feed management.",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full mb-8">
        {Object.values(TOPIC_BUNDLES).map((topic) => {
          const Icon = ICONS[topic.icon] || Atom;
          const isSelected = selectedTopics.has(topic.id);

          return (
            <button
              type="button"
              aria-pressed={isSelected}
              key={topic.id}
              onClick={() => toggleTopic(topic.id)}
              className={cn(
                "group relative flex flex-col p-4 rounded-xl text-left border-2 transition-all duration-200",
                "hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/20",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-surface-1 hover:border-primary/50"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground group-hover:text-primary"
                  )}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                {isSelected && (
                  <div className="absolute top-4 right-4 text-primary animate-in zoom-in spin-in-90 duration-200">
                    <Check className="w-5 h-5" aria-hidden="true" />
                  </div>
                )}
              </div>

              <h3 className="font-semibold text-foreground mb-1">{topic.label}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{topic.description}</p>

              <div className="mt-4 pt-3 border-t border-border/10 flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                  Includes
                </span>
                <div className="flex -space-x-1.5 overflow-hidden">
                  {/* Visual flair: tiny avatars or feed icons could go here */}
                  {topic.feeds.slice(0, 3).map((f) => (
                    <div
                      key={f.url}
                      className="w-4 h-4 rounded-full bg-surface-3 border border-background flex items-center justify-center text-[8px] text-muted-foreground/50"
                    >
                      {f.title[0]}
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Button
        size="lg"
        onClick={handleContinue}
        disabled={selectedTopics.size === 0 || isLoading}
        className="min-w-[200px] h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Setting up your briefing...
          </>
        ) : (
          t("continue", { defaultMessage: "Create My Briefing" })
        )}
      </Button>
    </div>
  );
}
