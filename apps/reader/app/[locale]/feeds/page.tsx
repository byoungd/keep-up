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
import { FeedProvider, useFeedItems } from "@/providers/FeedProvider";
import type { FeedItemRow } from "@ku0/db";
import { useSearchParams } from "next/navigation";
import * as React from "react";

function FeedsPageContent() {
  const searchParams = useSearchParams();
  const filter = (searchParams.get("filter") ?? "unread") as FeedFilter;
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hydrated, setHydrated] = React.useState(false);

  // Lift items state
  const { data: items = [] } = useFeedItems(filter);
  const selectedItem = React.useMemo(
    () => items.find((i: FeedItemRow) => i.itemId === selectedItemId) ?? null,
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
        <FeedListHeader filter={filter} onAddFeed={() => setShowAddModal(true)} />
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

export default function FeedsPage() {
  return (
    <FeedProvider>
      <FeedsPageContent />
    </FeedProvider>
  );
}
