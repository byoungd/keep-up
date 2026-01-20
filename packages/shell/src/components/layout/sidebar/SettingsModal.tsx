"use client";

import { cn } from "@ku0/shared/utils";
import * as FocusScope from "@radix-ui/react-focus-scope";
import { X } from "lucide-react";
import * as React from "react";
import { useShellI18n, useShellPanels } from "../../../context/ReaderShellContext";
import type { SidebarGroupDefinition, SidebarUserConfig } from "../../../lib/sidebar";
import { Button } from "../../ui/Button";
import { AIPanelSection } from "./settings/AIPanelSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { SidebarConfigSection } from "./settings/SidebarConfigSection";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  userConfig: SidebarUserConfig;
  onSave: (config: SidebarUserConfig) => void;
  groups: SidebarGroupDefinition[];
}

export function SettingsModal({ open, onClose, userConfig, onSave, groups }: SettingsModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);
  const [liveMessage, setLiveMessage] = React.useState("");
  const i18n = useShellI18n();
  const { aiPanel, auxPanel } = useShellPanels();
  const t = (key: string, defaultValue?: string) => i18n.t(`Settings.${key}`, defaultValue || key);
  const panelPosition = auxPanel ? auxPanel.position : aiPanel.position;
  const availablePositions = auxPanel
    ? (["left", "right"] as Array<"main" | "left" | "right">)
    : undefined;
  const handlePanelPosition = React.useCallback(
    (position: "main" | "left" | "right") => {
      if (auxPanel) {
        if (position === "left" || position === "right") {
          auxPanel.setPosition(position);
        }
        return;
      }
      aiPanel.setPosition(position);
    },
    [auxPanel, aiPanel]
  );

  // Sync staged config and dialog state when modal opens/closes
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) {
        dialog.showModal();
      }
      // Move focus into the dialog
      const focusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    } else if (dialog.open) {
      dialog.close();
      lastFocusedRef.current?.focus();
    }
  }, [open]);

  const handleCancel = React.useCallback(() => {
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    if (!open) {
      setLiveMessage("");
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "bg-background border border-border rounded-xl shadow-2xl",
        "w-full max-w-md max-h-[80vh] overflow-hidden hidden open:flex open:flex-col",
        "backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      )}
      style={{
        // Inline styles to override browser UA dialog defaults
        position: "fixed",
        inset: "auto",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        margin: 0,
        padding: 0,
        maxWidth: "28rem", // md = 448px = 28rem
        maxHeight: "80vh",
      }}
      onClose={handleCancel}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          handleCancel();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          handleCancel();
        }
      }}
      aria-labelledby="customize-sidebar-title"
      aria-modal="true"
    >
      <FocusScope.Root loop trapped asChild>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <h2 id="customize-sidebar-title" className="text-lg font-semibold text-foreground">
              {t("title")}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleCancel}
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-auto-hide px-5 py-4 space-y-3 focus-visible:outline-none">
            <AppearanceSection t={t} />

            <AIPanelSection
              t={t}
              position={panelPosition}
              setPosition={handlePanelPosition}
              availablePositions={availablePositions}
            />

            <SidebarConfigSection
              userConfig={userConfig}
              onSave={onSave}
              groups={groups}
              t={t}
              setLiveMessage={setLiveMessage}
            />
          </div>

          <output className="sr-only" aria-live="polite">
            {liveMessage}
          </output>
        </div>
      </FocusScope.Root>
    </dialog>
  );
}
