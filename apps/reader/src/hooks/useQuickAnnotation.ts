"use client";

import { useToast } from "@/components/ui/Toast";
import { useKeyboardShortcuts } from "@/context/KeyboardShortcutsContext";
import { useEffect } from "react";

/**
 * Hook to enable quick annotation creation with the H key.
 *
 * When text is selected, pressing H creates a yellow highlight.
 * The shortcut only fires when there's an active text selection.
 */
export function useQuickAnnotation() {
  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts();
  const { toast } = useToast();

  useEffect(() => {
    // Register H for quick highlight (yellow)
    registerShortcut({
      id: "quick-highlight",
      label: "Quick Highlight",
      keys: ["h"],
      description: "Create yellow highlight on selected text",
      section: "Annotations",
      action: () => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (!selectedText) {
          // No selection, don't do anything (let the key pass through)
          return;
        }

        // Dispatch the create annotation event
        window.dispatchEvent(
          new CustomEvent("lfcc-create-annotation", {
            detail: { color: "yellow" },
          })
        );

        toast("Highlight created", "success");
      },
    });

    return () => {
      unregisterShortcut("quick-highlight");
    };
  }, [registerShortcut, unregisterShortcut, toast]);
}
