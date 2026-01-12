"use client";

import { Button } from "@/components/ui/Button";
import { useAIPanelState } from "@/context/PanelStateContext";
import { useProviderConfig } from "@/context/ProviderConfigContext";
import { useAuth } from "@/hooks/useAuth";
import { type DigestProviderConfig, useDigest } from "@/hooks/useDigest";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { DigestCard } from "./DigestCard";
import { PinToBriefModal } from "./PinToBriefModal";

export function DigestView() {
  const t = useTranslations("Digest");
  const { setAIRequest } = useAIPanelState();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { state: providerState, isHydrated, isProviderConfigured } = useProviderConfig();
  const [pinItem, setPinItem] = React.useState<{
    id: string;
    title: string;
    summary: string;
  } | null>(null);

  // Use authenticated user's ID, fallback to "anonymous" if not logged in
  const userId = user?.id ?? "anonymous";

  // Build provider config from context
  const providerConfig = React.useMemo<DigestProviderConfig | undefined>(() => {
    if (!isHydrated) {
      return undefined;
    }

    const activeProvider = providerState.activeProvider;
    const config = providerState.providers[activeProvider];

    if (!isProviderConfigured(activeProvider)) {
      return undefined;
    }

    return {
      providerId: activeProvider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: providerState.lanes.fast.modelId, // Use fast lane by default
    };
  }, [isHydrated, providerState, isProviderConfigured]);

  const hasConfiguredProvider = providerConfig !== undefined;
  const canFetch = hasConfiguredProvider && !isAuthLoading;

  const { digest, isLoading, error, regenerate } = useDigest({
    userId,
    autoFetch: canFetch,
    provider: providerConfig,
  });

  const handleRegenerate = async () => {
    await regenerate();
  };

  const handlePin = (card: { id: string; title: string; summary: string }) => {
    setPinItem(card);
  };

  const handleAsk = (card: { id: string; title: string; summary: string }) => {
    setAIRequest({
      prompt: `Tell me more about this: ${card.title}\n\nSummary: ${card.summary}`,
      context: card.summary,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t("dailyDigest")}</h1>
          <p className="text-muted-foreground">{digest?.title || t("subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">{t("pastDigests")}</Button>
          <Button onClick={handleRegenerate} disabled={isLoading} type="button">
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {t("regenerate")}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && !digest && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <p className="font-medium">Failed to load digest</p>
          <p className="text-sm opacity-80">{error.message}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && digest?.cards.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg mb-2">No digest items yet</p>
          <p className="text-sm">
            Add some RSS feeds or import content to generate your daily digest.
          </p>
        </div>
      )}

      {/* Grid */}
      {digest && digest.cards.length > 0 && (
        <div className="grid gap-6">
          {digest.cards.map((card) => (
            <DigestCard
              key={card.id}
              id={card.id}
              title={card.title}
              summary={card.summary}
              whyItMatters={card.whyItMatters}
              citations={card.citations}
              relatedTopics={card.relatedTopics}
              onPin={() => handlePin(card)}
              onAsk={() => handleAsk(card)}
            />
          ))}
        </div>
      )}

      {/* Footer Stats */}
      {digest && digest.status === "ready" && (
        <div className="text-center text-sm text-muted-foreground pt-4 border-t border-border">
          Generated from {digest.sourceItemCount} sources
          {digest.generatedAt && <> • {new Date(digest.generatedAt).toLocaleTimeString()}</>}
        </div>
      )}
      {/* Modal Integration */}
      {pinItem && (
        <PinToBriefModal
          isOpen={!!pinItem}
          onClose={() => setPinItem(null)}
          itemId={pinItem.id}
          itemTitle={pinItem.title}
          excerpt={pinItem.summary}
          itemType="digest_card"
        />
      )}
    </div>
  );
}
