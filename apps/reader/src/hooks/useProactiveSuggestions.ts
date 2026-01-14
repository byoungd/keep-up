"use client";

import { useFeedProvider } from "@/providers/FeedProvider";
import { Atom, Cloud, Coffee, Newspaper } from "lucide-react";
import * as React from "react";

export interface ProactiveSuggestion {
  id: string;
  title: string;
  description: string;
  actionPrompt: string;
  icon: React.ElementType;
}

export function useProactiveSuggestions() {
  const { subscriptions } = useFeedProvider();
  const [suggestions, setSuggestions] = React.useState<ProactiveSuggestion[]>([]);

  React.useEffect(() => {
    // Simple heuristic generation for now
    // Ideally this would check actual unread items and content clusters
    const generated: ProactiveSuggestion[] = [];

    // 1. Morning Briefing (Time based)
    const hour = new Date().getHours();
    if (hour < 12) {
      generated.push({
        id: "morning-brief",
        title: "Morning Briefing",
        description: "Get a 10-minute summary of the most critical tech updates to start your day.",
        actionPrompt:
          "Generate a morning briefing based on my top feeds. Focus on React, Cloud, and AI. Format as key stories.",
        icon: Coffee,
      });
    }

    // 2. Unread Summary (Content based)
    const hasUnread = subscriptions.some((sub) => (sub.unreadCount || 0) > 0);
    if (hasUnread) {
      generated.push({
        id: "unread-summary",
        title: "Summarize Unreads",
        description: "You have unread references. I can scan them and highlight what matters.",
        actionPrompt: "Scan all my unread articles and summarize the top 5 most interesting ones.",
        icon: Newspaper,
      });
    }

    // 3. Topic specific (if subscribed)
    const hasReact = subscriptions.some(
      // biome-ignore lint/suspicious/noExplicitAny: upstream type mismatch
      (sub: any) =>
        (sub.title ?? "").toLowerCase().includes("react") || (sub.url ?? "").includes("react")
    );
    if (hasReact) {
      generated.push({
        id: "react-updates",
        title: "React Ecosystem Updates",
        description: "Check for new releases or RFCs in the React world.",
        actionPrompt:
          "Are there any recent React releases or important RFCs in my feeds? Summarize them.",
        icon: Atom,
      });
    }

    // 4. Cloud/Infra
    const hasCloud = subscriptions.some(
      // biome-ignore lint/suspicious/noExplicitAny: upstream type mismatch
      (sub: any) => (sub.title ?? "").match(/cloud|aws|k8s|kubernetes/i)
    );
    if (hasCloud) {
      generated.push({
        id: "infra-monitor",
        title: "Cloud & Infra Report",
        description: "Outages, incidents, or major architectural shifts.",
        actionPrompt:
          "Check my feeds for any cloud outages, incidents, or major architectural announcements.",
        icon: Cloud,
      });
    }

    setSuggestions(generated.slice(0, 3)); // Limit to top 3
  }, [subscriptions]);

  return { suggestions };
}
