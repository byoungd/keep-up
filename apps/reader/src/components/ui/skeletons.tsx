"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 w-full h-full">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={`sidebar-skeleton-${n}`} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeedItemSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4 border-b border-border/40">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

/** Feed list loading skeleton - shows multiple item skeletons */
export function FeedListSkeleton({ count = 8 }: { count?: number }) {
  // Generate stable keys for skeleton items
  const skeletonKeys = Array.from({ length: count }, (_, i) => `feed-skeleton-${i + 1}`);

  return (
    <div className="flex flex-col animate-in fade-in duration-300">
      {skeletonKeys.map((key) => (
        <FeedItemSkeleton key={key} />
      ))}
    </div>
  );
}

export function DocumentSkeleton() {
  return (
    <div className="reader-surface w-full max-w-3xl mx-auto py-16 px-8 md:px-12 min-h-screen animate-in fade-in duration-500">
      {/* Title skeleton - matches ArticleRenderer h1 */}
      <div className="mb-12">
        <Skeleton className="h-10 md:h-12 w-4/5 mb-4" />
        <Skeleton className="h-10 md:h-12 w-2/3" />
      </div>

      {/* Header controls skeleton */}
      <div className="flex items-center gap-4 mb-8 pb-6 border-b border-border/40">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-4 w-px bg-border/50" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>

      {/* Content paragraphs - varied widths for natural look */}
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-4/5" />
        </div>

        <div className="space-y-3 pt-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-10/12" />
        </div>

        <div className="space-y-3 pt-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
    </div>
  );
}

/** Reader page skeleton - full page loading state */
export function ReaderPageSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto">
      <DocumentSkeleton />
    </div>
  );
}
