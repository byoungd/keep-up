"use client";

import { cn } from "@ku0/shared/utils";
import { Plus, Rss } from "lucide-react";
import { useTranslations } from "next-intl";

interface PopularFeedsProps {
  onSelect: (url: string, title: string) => void;
}

// Popular RSS feeds for quick subscription
const POPULAR_FEEDS = [
  {
    title: "Hacker News",
    url: "https://hnrss.org/frontpage",
    category: "tech",
  },
  {
    title: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "tech",
  },
  {
    title: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "tech",
  },
  {
    title: "CSS-Tricks",
    url: "https://css-tricks.com/feed/",
    category: "dev",
  },
  {
    title: "Smashing Magazine",
    url: "https://www.smashingmagazine.com/feed/",
    category: "dev",
  },
  {
    title: "A List Apart",
    url: "https://alistapart.com/main/feed/",
    category: "dev",
  },
  {
    title: "Dev.to",
    url: "https://dev.to/feed",
    category: "dev",
  },
  {
    title: "BBC News",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
    category: "news",
  },
  {
    title: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
    category: "news",
  },
  {
    title: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "tech",
  },
];

export function PopularFeeds({ onSelect }: PopularFeedsProps) {
  const t = useTranslations("Feeds");

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">{t("popularFeeds")}</h3>
      <div className="grid grid-cols-2 gap-2">
        {POPULAR_FEEDS.map((feed) => (
          <button
            key={feed.url}
            type="button"
            onClick={() => onSelect(feed.url, feed.title)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-left",
              "border border-border hover:bg-muted/50 hover:border-primary/50",
              "transition-colors group"
            )}
          >
            <Rss className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
            <span className="text-sm truncate">{feed.title}</span>
            <Plus className="w-3 h-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
