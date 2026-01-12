export interface PanelProbe {
  minSize: number;
  maxAvailable: number;
}

/**
 * Calculate new panel width with constraints and snapping resistance.
 * This logic is shared between 3-pane and 2-pane resizing.
 */
export function calculatePanelResize(
  startWidth: number,
  deltaPercent: number,
  minSize: number,
  maxAvailable: number,
  snapThresholdRatio = 0.5 // Ratio of minSize at which we snap to 0
): number {
  let newWidth = startWidth + deltaPercent;

  // 1. Clamp to max available
  // We can't exceed what's available
  newWidth = Math.min(newWidth, maxAvailable);

  // 2. Collapse logic with resistance
  // If we are below the minimum size...
  if (newWidth < minSize) {
    const collapseThreshold = minSize * snapThresholdRatio;
    // If we are still above the threshold, "resist" by clamping to minSize
    if (newWidth > collapseThreshold) {
      newWidth = minSize;
    } else {
      // If we crossed the threshold, snap to close
      newWidth = 0;
    }
  }

  return newWidth;
}

/**
 * Calculate effective minimum sizes based on pixel constraints.
 * useful when we have both % targets and px minimums (e.g. sidebar needs 250px).
 */
export function calculateEffectiveMinSizes(
  minSizes: number[], // % or px
  minWidthsPx: number[] | undefined,
  containerWidth: number,
  layoutUnit: "percent" | "pixel" = "percent"
): number[] {
  // Create a copy to avoid mutation
  const effective: number[] = [...minSizes];

  if (!minWidthsPx || containerWidth === 0) {
    return effective;
  }

  for (let i = 0; i < effective.length; i++) {
    const minPx = minWidthsPx[i];
    if (minPx && minPx > 0) {
      if (layoutUnit === "percent") {
        // Convert px to %
        const minPercent = (minPx / containerWidth) * 100;
        // Take the larger of the two requirements
        effective[i] = Math.max(effective[i], minPercent);
      } else {
        // Pixel mode: direct comparison
        effective[i] = Math.max(effective[i], minPx);
      }
    }
  }
  return effective;
}
