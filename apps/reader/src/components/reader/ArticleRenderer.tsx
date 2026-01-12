"use client";

import { Button } from "@/components/ui/Button";
import { Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";

interface ArticleRendererProps {
  title: string;
  children: React.ReactNode;
  /** Optional epigraph/dedication text */
  epigraph?: string;
  /** Show audio controls */
  showAudioControls?: boolean;
  /** Show language switcher */
  showLanguageSwitcher?: boolean;
}

export function ArticleRenderer({
  title,
  children,
  epigraph,
  showAudioControls = false,
  showLanguageSwitcher = false,
}: ArticleRendererProps) {
  const t = useTranslations("Article");

  const hasHeaderControls = showAudioControls || showLanguageSwitcher;

  return (
    <article className="reader-surface w-full max-w-3xl mx-auto py-16 px-8 md:px-12 min-h-screen relative animate-in fade-in duration-500 slide-in-from-bottom-2">
      {/* Header Section */}
      <header className="mb-12">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold mb-6 tracking-tight text-foreground leading-[1.15]">
          {title}
        </h1>

        {hasHeaderControls && (
          <div className="flex items-center justify-between text-muted-foreground/80 border-b border-border/40 pb-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              {showAudioControls && (
                <>
                  <Button variant="ghost" size="sm" className="gap-2 h-8">
                    <Volume2 className="h-4 w-4 stroke-[1.5]" />
                    <span>{t("listen")}</span>
                  </Button>
                  {showLanguageSwitcher && <div className="h-4 w-px bg-border/50 mx-2" />}
                </>
              )}
              {showLanguageSwitcher && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    {t("languageZh")}
                  </Button>
                  <span className="text-muted-foreground/40 text-xs">|</span>
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    {t("languageEn")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {epigraph && (
          <div className="mt-12 mb-10">
            <p className="text-lg text-muted-foreground italic text-center max-w-2xl mx-auto leading-relaxed">
              "{epigraph}"
            </p>
          </div>
        )}
      </header>

      {/* Content Section */}
      <div className="reader-prose prose prose-lg md:prose-xl dark:prose-invert max-w-none text-foreground/90 selection:bg-primary/20 prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4">
        {children}
      </div>

      {/* Footer */}
      <footer className="mt-24 pt-12 border-t border-border/40 flex justify-between items-center text-xs text-muted-foreground uppercase tracking-widest font-medium opacity-60 hover:opacity-100 transition-opacity">
        <span>{t("endOfDocument")}</span>
        <span>ku0.com</span>
      </footer>
    </article>
  );
}
