"use client";

import { useRssStoreOptional } from "@/lib/rss";
import { type FeedSubscription, useFeedProviderOptional } from "@/providers/FeedProvider";
import { Atom, Cloud, Coffee, Newspaper } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

interface SubscriptionSummary {
  title: string | null;
  url: string;
  unreadCount?: number;
}

export interface ProactiveSuggestion {
  id: string;
  title: string;
  description: string;
  actionPrompt: string;
  icon: React.ElementType;
}

export function useProactiveSuggestions() {
  const t = useTranslations("AIPanel");
  const feedContext = useFeedProviderOptional();
  const rssStore = useRssStoreOptional();
  const rssSubscriptions = rssStore?.subscriptions ?? [];
  const rssItems = rssStore?.items ?? [];
  const feedSubscriptions = feedContext?.subscriptions;
  const [suggestions, setSuggestions] = React.useState<ProactiveSuggestion[]>([]);

  // Refresh trigger to update time-based suggestions periodically
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    // Refresh every 30 minutes for time-based suggestions
    const interval = setInterval(
      () => {
        setRefreshTick((t) => t + 1);
      },
      30 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, []);

  const subscriptions = React.useMemo<SubscriptionSummary[]>(() => {
    if (feedSubscriptions) {
      return feedSubscriptions.map((sub: FeedSubscription) => ({
        title: sub.displayName ?? sub.title ?? null,
        url: sub.url,
        unreadCount: sub.unreadCount,
      }));
    }

    return rssSubscriptions.map((sub) => ({
      title: sub.displayName ?? sub.title,
      url: sub.url,
    }));
  }, [feedSubscriptions, rssSubscriptions]);

  const hasUnread = React.useMemo(() => {
    if (feedSubscriptions) {
      return feedSubscriptions.some((sub) => (sub.unreadCount ?? 0) > 0);
    }
    return rssItems.some((item) => item.readState === "unread");
  }, [feedSubscriptions, rssItems]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTick intentionally triggers periodic recalculation
  React.useEffect(() => {
    // Simple heuristic generation for now
    // Ideally this would check actual unread items and content clusters
    const generated: ProactiveSuggestion[] = [];

    // 1. Morning Briefing (Time based)
    const hour = new Date().getHours();
    if (hour < 12) {
      generated.push({
        id: "morning-brief",
        title: t("suggestions.morning-brief.title"),
        description: t("suggestions.morning-brief.description"),
        actionPrompt: t("suggestions.morning-brief.actionPrompt"),
        icon: Coffee,
      });
    }

    // 2. Unread Summary (Content based)
    if (hasUnread) {
      generated.push({
        id: "unread-summary",
        title: t("suggestions.unread-summary.title"),
        description: t("suggestions.unread-summary.description"),
        actionPrompt: t("suggestions.unread-summary.actionPrompt"),
        icon: Newspaper,
      });
    }

    // 3. Topic specific (if subscribed)
    const hasReact = subscriptions.some(
      (sub) =>
        (sub.title ?? "").toLowerCase().includes("react") || sub.url.toLowerCase().includes("react")
    );
    if (hasReact) {
      generated.push({
        id: "react-updates",
        title: t("suggestions.react-updates.title"),
        description: t("suggestions.react-updates.description"),
        actionPrompt: t("suggestions.react-updates.actionPrompt"),
        icon: Atom,
      });
    }

    // 4. Cloud/Infra
    const hasCloud = subscriptions.some((sub) =>
      (sub.title ?? "").match(/cloud|aws|k8s|kubernetes/i)
    );
    if (hasCloud) {
      generated.push({
        id: "infra-monitor",
        title: t("suggestions.infra-monitor.title"),
        description: t("suggestions.infra-monitor.description"),
        actionPrompt: t("suggestions.infra-monitor.actionPrompt"),
        icon: Cloud,
      });
    }

    setSuggestions(generated.slice(0, 3)); // Limit to top 3
  }, [hasUnread, subscriptions, refreshTick, t]);

  return { suggestions };
}
