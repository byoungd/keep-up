"use client";

import { AnnotationSpan } from "@/components/annotations/AnnotationSpan";
import { SelectionToolbar } from "@/components/annotations/SelectionToolbar";
import { AIPanel } from "@/components/layout/AIPanel";
import { AppShell } from "@/components/layout/AppShell";
import { OnboardingFlow } from "@/components/layout/OnboardingFlow";
import { PolicyDegradationBanner } from "@/components/lfcc/PolicyDegradationBanner";
import { ArticleRenderer } from "@/components/reader/ArticleRenderer";
import { KeyboardShortcutsProvider } from "@/context/KeyboardShortcutsContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePolicyDegradationStore } from "@/lib/lfcc/policyDegradationStore";
import { useRssStore } from "@/lib/rss";
import { useTranslations } from "next-intl";
import * as React from "react";

export default function App() {
  const t = useTranslations("AppPage");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hydrated, setHydrated] = React.useState(false);
  const { degraded, reasons, clear } = usePolicyDegradationStore();
  const { subscriptions, addSubscription } = useRssStore();
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  // Simple hydration fix
  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    // Show onboarding if no subscriptions and hydrated
    if (hydrated && subscriptions.length === 0) {
      setShowOnboarding(true);
    }
  }, [hydrated, subscriptions.length]);

  const handleOnboardingComplete = async (data: { topics: string[]; sources: string[] }) => {
    // Map bundle IDs to URLs
    const bundles: Record<string, string[]> = {
      "tech-news": ["https://techcrunch.com/feed/", "https://www.theverge.com/rss/index.xml"],
      "ai-research": ["https://blogs.nvidia.com/feed/", "https://openai.com/blog/rss.xml"],
      design: ["https://sidebar.io/feed.xml", "https://alistapart.com/main/feed/"],
    };

    const urlsToSubscribe = new Set<string>();

    for (const bundleId of data.sources) {
      const urls = bundles[bundleId] || [];
      for (const url of urls) {
        urlsToSubscribe.add(url);
      }
    }

    // Add subscriptions
    // We do this sequentially or parallel, simplistic for now
    for (const url of Array.from(urlsToSubscribe)) {
      try {
        await addSubscription(url);
      } catch (e) {
        console.error("Failed to add onboarding feed", url, e);
      }
    }

    setShowOnboarding(false);
  };

  const effectiveDesktop = hydrated && isDesktop;

  const article = (
    <ArticleRenderer title={t("articleTitle")}>
      <p
        data-block-id="block_intro"
        className="text-xl leading-relaxed first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:leading-none"
      >
        <AnnotationSpan initialState="active">
          我们每个人都生活在各自的过去中，人们会用一分钟的时间去认识一个人，用一小时的时间去喜欢一个人，再用一天的时间去爱上一个人，到最后呢，却要用一辈子的时间去忘记一个人。
        </AnnotationSpan>
      </p>

      <h2 className="text-3xl font-bold tracking-tight pt-8 border-l-[3px] border-primary/10 pl-6 mt-12 mb-8">
        {t("sectionIntro")}
      </h2>
      <p data-block-id="block_p1">
        An advanced{" "}
        <AnnotationSpan initialState="broken_grace">guide to learn English which</AnnotationSpan>{" "}
        might benefit you a lot. The interface you are currently using is designed to be
        distraction-free, allowing you to focus entirely on the content.
      </p>
      <p data-block-id="block_p2">
        离谱的英语学习指南/英语学习教程。{" "}
        <AnnotationSpan initialState="active_unverified">Verify me please.</AnnotationSpan> This is
        a demonstration of the annotation capabilities within the new design system.
      </p>

      <div className="my-8 p-6 bg-surface-2 rounded-xl border border-border/50 italic text-muted-foreground/80">
        "Design is not just what it looks like and feels like. Design is how it works."
      </div>
    </ArticleRenderer>
  );

  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  return (
    <KeyboardShortcutsProvider>
      <SelectionToolbar />
      <AppShell
        isDesktop={effectiveDesktop}
        rightPanel={<AIPanel onClose={() => undefined} />} // AppShell handles the close callback injection
      >
        <div className="h-full flex flex-col relative">
          {degraded && <PolicyDegradationBanner reasons={reasons} onDismiss={clear} />}
          <div className="flex-1 overflow-auto">{article}</div>
        </div>
      </AppShell>
    </KeyboardShortcutsProvider>
  );
}
