"use client";

import { useToast } from "@/components/ui/Toast";
import { useImportManager } from "@/hooks/useImportManager";
import { trackImportFailed, trackImportSucceeded } from "@/lib/import/telemetry";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

/**
 * Subscribes to ImportManager events and shows toast notifications.
 */
export function ImportToasts() {
  const manager = useImportManager();
  const { toast } = useToast();
  const t = useTranslations("Import");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!manager) {
      return;
    }

    const handleComplete = (jobId: string, documentId: string) => {
      if (!mountedRef.current) {
        return;
      }
      trackImportSucceeded(jobId, documentId);
      toast(t("importCompleteToLibrary"), "success");
    };

    const handleFailed = (jobId: string, error: Error) => {
      if (!mountedRef.current) {
        return;
      }
      trackImportFailed(jobId, error.message);
      toast(`${t("importFailed")}: ${error.message}`, "error");
    };

    const unsubComplete = manager.on("onJobComplete", handleComplete);
    const unsubFail = manager.on("onJobFailed", handleFailed);

    return () => {
      unsubComplete();
      unsubFail();
    };
  }, [manager, toast, t]);

  return null;
}
