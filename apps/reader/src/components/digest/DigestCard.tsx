"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ArrowUpRight, BookOpen, MessageSquare, Pin } from "lucide-react";
import { useTranslations } from "next-intl";

export interface DigestCardProps {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  citations: Array<{
    id: string;
    url: string;
    title: string;
    sourceName: string;
  }>;
  relatedTopics: string[];
  onPin: (id: string) => void;
  onAsk: (id: string) => void;
}

import { cn } from "@keepup/shared/utils";
import { useState } from "react";
import { PinToBriefModal } from "./PinToBriefModal";

export function DigestCard({
  id,
  title,
  summary,
  whyItMatters,
  citations,
  relatedTopics,
  onPin: _onPin,
  onAsk,
  className,
}: DigestCardProps & { className?: string }) {
  const t = useTranslations("Digest");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-surface-1 hover:border-primary/50 transition-all duration-300 p-6 shadow-sm hover:shadow-md",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors flex-1">
            {title}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -mr-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => setIsPinModalOpen(true)}
          >
            <Pin className="h-4 w-4" />
          </Button>
        </div>

        {/* Topics */}
        <div className="flex flex-wrap gap-2 mb-4">
          {relatedTopics.map((topic) => (
            <Badge
              key={topic}
              variant="secondary"
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 font-medium border-transparent bg-secondary/50 text-secondary-foreground/80"
            >
              {topic}
            </Badge>
          ))}
        </div>

        {/* Summary */}
        <div className="prose prose-sm dark:prose-invert mb-6 text-muted-foreground/90 leading-relaxed">
          <p>{summary}</p>
        </div>

        {/* Why It Matters */}
        <div className="mb-6 bg-surface-2/30 rounded-lg p-4 border border-border/40 backdrop-blur-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shadow-[0_0_8px_var(--color-accent-cyan)]" />
            {t("whyItMatters")}
          </h4>
          <ul className="space-y-2">
            {whyItMatters.map((point) => (
              <li key={point} className="text-sm flex items-start gap-2 text-foreground/90">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-foreground/40 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Citations / Evidence */}
        <div className="mb-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-violet shadow-[0_0_8px_var(--color-accent-violet)]" />
            {t("evidence")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {citations.map((cite) => (
              <a
                key={cite.id}
                href={cite.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/cite flex items-center gap-2 px-2.5 py-1.5 bg-surface-2/50 border border-border/50 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors max-w-[240px]"
              >
                <div
                  className="w-3.5 h-3.5 rounded-full bg-cover bg-center shrink-0 opacity-70 group-hover/cite:opacity-100 transition-opacity"
                  style={{
                    backgroundImage: `url(https://www.google.com/s2/favicons?domain=${new URL(cite.url).hostname}&sz=32)`,
                  }}
                />
                <span className="truncate font-medium">{cite.sourceName}</span>
                <ArrowUpRight className="w-3 h-3 opacity-50 group-hover/cite:translate-x-0.5 group-hover/cite:-translate-y-0.5 transition-transform" />
              </a>
            ))}
            {citations.length === 0 && (
              <span className="text-xs text-red-400 italic flex items-center gap-1">
                {t("lowConfidence")}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-4 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-surface-2"
            onClick={() => onAsk(id)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {t("askKu0")}
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPinModalOpen(true)}
            className="gap-2 border-border/60 hover:bg-surface-2"
          >
            <Pin className="w-3.5 h-3.5" />
            {t("pinToBrief")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.open(citations[0]?.url, "_blank")}
            className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm hover:shadow"
          >
            {t("readOriginal")}
            <BookOpen className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <PinToBriefModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        itemTitle={title}
        // itemUrl={citations[0]?.url}
      />
    </>
  );
}
