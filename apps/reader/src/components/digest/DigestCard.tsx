"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BookOpen, ChevronDown, MessageSquare, Pin } from "lucide-react";
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
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-surface-1 to-surface-2/50 backdrop-blur-sm transition-all duration-300 p-6 shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:border-primary/20",
          className
        )}
      >
        {/* Hover decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4 relative z-10">
          <h3 className="text-xl font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors flex-1 leading-tight">
            {title}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -mr-2 text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors"
            onClick={() => setIsPinModalOpen(true)}
          >
            <Pin className="h-4 w-4" />
          </Button>
        </div>

        {/* Topics */}
        <div className="flex flex-wrap gap-2 mb-6 relative z-10">
          {relatedTopics.map((topic) => (
            <Badge
              key={topic}
              variant="outline"
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 font-medium border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 transition-colors rounded-md"
            >
              {topic}
            </Badge>
          ))}
        </div>

        {/* Summary */}
        <div className="prose prose-sm dark:prose-invert mb-8 text-muted-foreground/80 leading-relaxed relative z-10">
          <p>{summary}</p>
        </div>

        {/* Why It Matters */}
        <div className="mb-6 rounded-lg p-4 border border-white/5 bg-surface-2/30 relative z-10">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shadow-[0_0_8px_var(--color-accent-cyan)]" />
            {t("whyItMatters")}
          </h4>
          <ul className="space-y-2.5">
            {whyItMatters.map((point) => (
              <li
                key={point}
                className="text-sm flex items-start gap-3 text-foreground/90 leading-snug"
              >
                <span className="mt-1.5 w-1 h-1 rounded-full bg-accent-cyan/50 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Citations / Evidence */}
        <div className="mb-6 relative z-10">
          <button
            type="button"
            onClick={() => setIsEvidenceOpen(!isEvidenceOpen)}
            className="group/evidence flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 hover:text-foreground transition-colors outline-none"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent-violet shadow-[0_0_8px_var(--color-accent-violet)]" />
            {t("evidence")}
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform duration-200 opacity-50 group-hover/evidence:opacity-100",
                isEvidenceOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </button>

          <AnimatePresence>
            {isEvidenceOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pt-2 pb-1">
                  {citations.map((cite) => (
                    <a
                      key={cite.id}
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/cite flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 hover:border-white/10 transition-all max-w-[240px]"
                    >
                      <div
                        className="w-4 h-4 rounded-full bg-cover bg-center shrink-0 opacity-70 group-hover/cite:opacity-100 transition-opacity"
                        style={{
                          backgroundImage: `url(https://www.google.com/s2/favicons?domain=${new URL(cite.url).hostname}&sz=32)`,
                        }}
                      />
                      <span className="truncate font-medium">{cite.sourceName}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-30 group-hover/cite:opacity-100 group-hover/cite:translate-x-0.5 group-hover/cite:-translate-y-0.5 transition-all" />
                    </a>
                  ))}
                  {citations.length === 0 && (
                    <span className="text-xs text-red-400 italic flex items-center gap-1">
                      {t("lowConfidence")}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!isEvidenceOpen && citations.length > 0 && (
            <div className="text-[10px] text-muted-foreground/50 pl-4">
              {citations.length} sources linked
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-4 border-t border-white/5 relative z-10">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-white/5"
            onClick={() => onAsk(id)}
          >
            <MessageSquare className="w-4 h-4 mr-2 opacity-70" />
            {t("askKu0")}
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPinModalOpen(true)}
            className="gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent hover:border-white/5"
          >
            <Pin className="w-3.5 h-3.5 opacity-70" />
            {t("pinToBrief")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.open(citations[0]?.url, "_blank")}
            className="gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/10 shadow-none hover:shadow-lg hover:shadow-white/5 transition-all"
          >
            {t("readOriginal")}
            <BookOpen className="w-3.5 h-3.5 opacity-70" />
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
