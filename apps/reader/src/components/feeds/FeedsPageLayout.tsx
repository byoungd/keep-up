"use client";

import {
  AddFeedModal,
  type FeedFilter,
  FeedItemPreview,
  FeedList,
  FeedListHeader,
} from "@/components/feeds";
import { AppShell } from "@/components/layout/AppShell";
import { useFeedNavigation } from "@/hooks/useFeedNavigation";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { RssStoreProvider } from "@/lib/rss";
import { useFeedItems } from "@/providers/FeedProvider";
import type { FeedItemRow } from "@keepup/db";
import { useSearchParams } from "next/navigation";
import * as React from "react";

interface FeedsPageLayoutProps {
  initialFilter?: FeedFilter;
}

function FeedsPageContent({ initialFilter }: FeedsPageLayoutProps) {
  const searchParams = useSearchParams();
  // distinct route takes precedence, otherwise fallback to search param
  const filter = initialFilter ?? ((searchParams.get("filter") ?? "unread") as FeedFilter);

  const [showAddModal, setShowAddModal] = React.useState(false);
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hydrated, setHydrated] = React.useState(false);
  const { data: items = [] } = useFeedItems(filter);
  const selectedItem = React.useMemo(
    () => items.find((item: FeedItemRow) => item.itemId === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  // Keyboard navigation
  useFeedNavigation(filter, selectedItemId, setSelectedItemId);

  const effectiveDesktop = hydrated && isDesktop;

  return (
    <AppShell
      isDesktop={effectiveDesktop}
      rightPanel={<FeedItemPreview item={selectedItem} onClose={() => setSelectedItemId(null)} />}
    >
      {/* Main content - no Sources rail */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <FeedListHeader filter={filter} />
        <FeedList
          filter={filter}
          items={items}
          onItemClick={setSelectedItemId}
          activeItemId={selectedItemId}
          className="flex-1"
        />
      </main>
      <AddFeedModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </AppShell>
  );
}

export function FeedsPageLayout(props: FeedsPageLayoutProps) {
  return (
    <RssStoreProvider>
      <FeedsPageContent {...props} />
    </RssStoreProvider>
  );
}
