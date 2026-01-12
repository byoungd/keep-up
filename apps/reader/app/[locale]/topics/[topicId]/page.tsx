"use client";

import { FeedList } from "@/components/feeds/FeedList";
import { useTranslations } from "next-intl";
import { use, useState } from "react";

interface TopicPageProps {
  params: Promise<{
    locale: string;
    topicId: string;
  }>;
}

export default function TopicPage({ params }: TopicPageProps) {
  const { topicId } = use(params);
  const _t = useTranslations("FeedList");

  // In a real app, we would fetch topic details (name, etc.) here.
  // For MVP, we use the topicId as the title (capitalized).
  const topicName =
    decodeURIComponent(topicId).charAt(0).toUpperCase() + decodeURIComponent(topicId).slice(1);

  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const handleItemClick = (itemId: string) => {
    setActiveItemId(itemId);
    // Navigation to reading view is handled by FeedItemRow or parent usually,
    // but FeedList prop `onItemClick` suggests we handle it.
    // However, looking at usage, FeedList often just sets active state.
    // We'll update the state for now.
  };

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/40 px-6 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
            <span className="text-lg font-bold">#</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">{topicName}</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Topic Feed
            </p>
          </div>
        </div>
        <div>
          <button
            type="button"
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-border/60 hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all"
          >
            Follow Topic
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <FeedList
          filter={topicId}
          onItemClick={handleItemClick}
          activeItemId={activeItemId}
          className="h-full"
        />
      </div>
    </div>
  );
}
