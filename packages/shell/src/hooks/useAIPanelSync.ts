import * as React from "react";
import type { ResizableThreePaneLayoutHandle } from "../components/layout/ResizableThreePaneLayout";

interface UseAIPanelSyncProps {
  isDesktop: boolean;
  layoutRef: React.RefObject<ResizableThreePaneLayoutHandle | null>;
  isAIPanelHydrated?: boolean;
  isAIPanelVisible: boolean;
  aiPanelPosition: "left" | "right" | "main";
  targetWidth: number;
}

export function useAIPanelSync({
  isDesktop,
  layoutRef,
  isAIPanelHydrated,
  isAIPanelVisible,
  aiPanelPosition,
  targetWidth,
}: UseAIPanelSyncProps) {
  const resolvedPanelPosition = aiPanelPosition ?? "right";
  const isAIPanelLeft = resolvedPanelPosition === "left";
  const isAIPanelRight = resolvedPanelPosition === "right";
  const isAIPanelMain = resolvedPanelPosition === "main";

  React.useEffect(() => {
    // Check if layoutRef.current is available and we are on desktop
    if (!isDesktop || !layoutRef.current || !(isAIPanelHydrated ?? true)) {
      return;
    }

    const validLayout = layoutRef.current;

    if (isAIPanelMain) {
      validLayout.collapseRight();
      validLayout.collapseLeft?.();
      return;
    }

    if (isAIPanelLeft) {
      validLayout.collapseRight();
      if (isAIPanelVisible) {
        validLayout.expandLeft?.(targetWidth);
      } else {
        validLayout.collapseLeft?.();
      }
      return;
    }

    // Default: Right panel
    validLayout.collapseLeft?.();
    if (isAIPanelVisible) {
      validLayout.expandRight(targetWidth);
    } else {
      validLayout.collapseRight();
    }
  }, [
    isAIPanelVisible,
    isDesktop,
    isAIPanelHydrated,
    isAIPanelLeft,
    isAIPanelMain,
    targetWidth,
    layoutRef,
  ]);

  return { isAIPanelLeft, isAIPanelRight, isAIPanelMain };
}
