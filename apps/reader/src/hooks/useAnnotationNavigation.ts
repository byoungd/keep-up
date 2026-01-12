"use client";

import { useToast } from "@/components/ui/Toast";
import { useKeyboardShortcuts } from "@/context/KeyboardShortcutsContext";
import { annotationController } from "@/lib/annotations/annotationController";
import { useEffect } from "react";

/**
 * Hook to enable keyboard navigation between annotations.
 *
 * Registers `]` for next annotation and `[` for previous annotation.
 * Shows toast feedback when no annotations are available.
 */
export function useAnnotationNavigation() {
  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts();
  const { toast } = useToast();

  useEffect(() => {
    // Register ] for next annotation
    registerShortcut({
      id: "annotation-next",
      label: "Next Annotation",
      keys: ["]"],
      description: "Jump to the next annotation in document",
      section: "Annotations",
      action: () => {
        const navigated = annotationController.navigateToNextAnnotation();
        if (!navigated) {
          toast("No annotations in document", "info");
        }
      },
    });

    // Register [ for previous annotation
    registerShortcut({
      id: "annotation-prev",
      label: "Previous Annotation",
      keys: ["["],
      description: "Jump to the previous annotation in document",
      section: "Annotations",
      action: () => {
        const navigated = annotationController.navigateToPreviousAnnotation();
        if (!navigated) {
          toast("No annotations in document", "info");
        }
      },
    });

    return () => {
      unregisterShortcut("annotation-next");
      unregisterShortcut("annotation-prev");
    };
  }, [registerShortcut, unregisterShortcut, toast]);
}
