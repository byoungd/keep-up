"use client";

import { useToast } from "@/components/ui/Toast";
import { useImportContext } from "@/context/ImportContext";
import { useGlobalDropTarget } from "@/hooks/useGlobalDropTarget";
import { useImportManager } from "@/hooks/useImportManager";
import { registerFile } from "@/lib/db";
import { trackDrop, trackDropOverlayShown } from "@/lib/import/telemetry";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { GlobalDropOverlay } from "./GlobalDropOverlay";
import { ImportShortcutHandler } from "./ImportShortcutHandler";
import { ImportToasts } from "./ImportToasts";

/**
 * Global import handler that ties together:
 * - Global drag & drop overlay
 * - Keyboard shortcuts
 * - Toast notifications
 */
export function GlobalImportHandler() {
  const manager = useImportManager();
  const { openImportModal } = useImportContext();
  const { toast } = useToast();
  const t = useTranslations("Import");
  const overlayShownRef = useRef(false);

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      if (!manager) {
        toast(t("managerNotReady"), "error");
        return;
      }

      trackDrop("file", files.length);
      toast(t("importingFiles", { count: files.length }), "info");

      for (const file of files) {
        try {
          const ref = await registerFile(file);
          await manager.enqueue({
            sourceType: "file",
            sourceRef: ref,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast(`${t("importFailed")}: ${message}`, "error");
        }
      }
    },
    [manager, toast, t]
  );

  const handleUrlDrop = useCallback(
    (urls: string[]) => {
      // Open modal with first URL prefilled for confirmation
      if (urls.length > 0) {
        trackDrop("url", urls.length);
        openImportModal(urls[0], "url");
      }
    },
    [openImportModal]
  );

  const handleUnsupportedDrop = useCallback(
    (files: File[]) => {
      const names = files.map((f) => f.name).join(", ");
      toast(
        t("unsupportedFileType", { files: names.slice(0, 50) + (names.length > 50 ? "..." : "") }),
        "warning"
      );
    },
    [toast, t]
  );

  const { isDragging, supportedExtensions } = useGlobalDropTarget({
    onFileDrop: handleFileDrop,
    onUrlDrop: handleUrlDrop,
    onUnsupportedDrop: handleUnsupportedDrop,
  });

  // Track overlay shown once per drag session
  useEffect(() => {
    if (isDragging && !overlayShownRef.current) {
      overlayShownRef.current = true;
      trackDropOverlayShown();
    } else if (!isDragging) {
      overlayShownRef.current = false;
    }
  }, [isDragging]);

  return (
    <>
      <GlobalDropOverlay isDragging={isDragging} supportedExtensions={supportedExtensions} />
      <ImportShortcutHandler />
      <ImportToasts />
    </>
  );
}
