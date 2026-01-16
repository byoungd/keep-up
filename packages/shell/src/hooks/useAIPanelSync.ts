import * as React from "react";
import type { ResizableThreePaneLayoutHandle } from "../components/layout/ResizableThreePaneLayout";

interface UseAIPanelSyncProps {
  isDesktop: boolean;
  layoutRef: React.RefObject<ResizableThreePaneLayoutHandle | null>;
  isAIPanelHydrated?: boolean;
  isAIPanelVisible: boolean;
  aiPanelPosition: "left" | "right" | "main";
  targetWidth: number;
  auxPanelVisible?: boolean;
  auxPanelPosition?: "left" | "right";
  auxPanelWidth?: number;
}

type LayoutHandle = ResizableThreePaneLayoutHandle;

type AuxLayoutState = {
  isVisible: boolean;
  position?: "left" | "right";
  width?: number;
};

function applyAuxLayout(layout: LayoutHandle, auxState: AuxLayoutState): boolean {
  if (!auxState.isVisible || !auxState.position || !auxState.width) {
    return false;
  }
  if (auxState.position === "left") {
    layout.collapseRight();
    layout.expandLeft?.(auxState.width);
    return true;
  }
  layout.collapseLeft?.();
  layout.expandRight(auxState.width);
  return true;
}

function applySideLayout({
  layout,
  isLeft,
  isVisible,
  targetWidth,
}: {
  layout: LayoutHandle;
  isLeft: boolean;
  isVisible: boolean;
  targetWidth: number;
}) {
  if (isLeft) {
    layout.collapseRight();
    if (isVisible) {
      layout.expandLeft?.(targetWidth);
    } else {
      layout.collapseLeft?.();
    }
    return;
  }
  layout.collapseLeft?.();
  if (isVisible) {
    layout.expandRight(targetWidth);
  } else {
    layout.collapseRight();
  }
}

export function useAIPanelSync({
  isDesktop,
  layoutRef,
  isAIPanelHydrated,
  isAIPanelVisible,
  aiPanelPosition,
  targetWidth,
  auxPanelVisible,
  auxPanelPosition,
  auxPanelWidth,
}: UseAIPanelSyncProps) {
  const resolvedPanelPosition = aiPanelPosition ?? "right";
  const isAIPanelLeft = resolvedPanelPosition === "left";
  const isAIPanelRight = resolvedPanelPosition === "right";
  const isAIPanelMain = resolvedPanelPosition === "main";

  React.useEffect(() => {
    if (!isDesktop || !(isAIPanelHydrated ?? true)) {
      return;
    }
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    if (isAIPanelMain) {
      const didApplyAux = applyAuxLayout(layout, {
        isVisible: auxPanelVisible ?? false,
        position: auxPanelPosition,
        width: auxPanelWidth,
      });
      if (didApplyAux) {
        return;
      }
      layout.collapseRight();
      layout.collapseLeft?.();
      return;
    }

    applySideLayout({
      layout,
      isLeft: isAIPanelLeft,
      isVisible: isAIPanelVisible,
      targetWidth,
    });
  }, [
    isAIPanelVisible,
    isDesktop,
    isAIPanelHydrated,
    isAIPanelLeft,
    isAIPanelMain,
    targetWidth,
    layoutRef,
    auxPanelVisible,
    auxPanelPosition,
    auxPanelWidth,
  ]);

  return { isAIPanelLeft, isAIPanelRight, isAIPanelMain };
}
