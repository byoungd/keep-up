"use client";

import { type SelectionResult, captureSelection } from "@/lib/dom/selection";
import { useEffect, useState } from "react";

export function useSelectionCapture() {
  const [currentSelection, setCurrentSelection] = useState<SelectionResult | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      const result = captureSelection();
      setCurrentSelection(result);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  return currentSelection;
}
