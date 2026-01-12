"use client";

import { cn } from "@keepup/shared/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

interface GlobalDropOverlayProps {
  isDragging: boolean;
  supportedExtensions: string[];
}

export function GlobalDropOverlay({ isDragging, supportedExtensions }: GlobalDropOverlayProps) {
  const t = useTranslations("Import");

  const extensionsText = supportedExtensions.map((e) => `.${e}`).join(", ");

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "fixed inset-0 z-100",
            "bg-background/80 backdrop-blur-sm",
            "flex items-center justify-center",
            "pointer-events-none"
          )}
          aria-live="polite"
          aria-label={t("dropToImport")}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "bg-surface-2 border border-border rounded-xl",
              "px-8 py-6 shadow-xl",
              "flex flex-col items-center gap-3",
              "max-w-sm text-center"
            )}
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{t("dropToImport")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("supportedFormats", { formats: extensionsText })}
              </p>
            </div>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
