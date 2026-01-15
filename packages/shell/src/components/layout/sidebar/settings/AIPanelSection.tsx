import { PanelLeft, PanelRight, Square } from "lucide-react";
import { OptionCard } from "./OptionCard";

interface AIPanelSectionProps {
  t: (key: string, defaultValue?: string) => string;
  position: "main" | "left" | "right";
  setPosition: (position: "main" | "left" | "right") => void;
}

export function AIPanelSection({ t, position, setPosition }: AIPanelSectionProps) {
  return (
    <fieldset
      className="grid items-center gap-2 rounded-xl border border-border/40 bg-surface-1/30 p-3"
      style={{ gridTemplateColumns: "auto 1fr" }}
      aria-labelledby="ai-panel-position-label"
    >
      <legend className="sr-only">{t("aiPanelPosition", "AI Panel")}</legend>
      <span
        id="ai-panel-position-label"
        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 whitespace-nowrap self-center"
      >
        {t("aiPanelPosition", "AI Panel")}
      </span>
      <div className="grid grid-cols-3 gap-2 w-full min-w-0">
        <OptionCard
          title={t("aiPanelLeftRail", "Left Rail")}
          description={t("aiPanelLeftRailDesc", "Dock beside the sidebar")}
          selected={position === "left"}
          onSelect={() => setPosition("left")}
          preview={<PanelLeft className="h-5 w-5" />}
        />
        <OptionCard
          title={t("aiPanelMain", "Main")}
          description={t("aiPanelMainDesc", "Show in the primary workspace")}
          selected={position === "main"}
          onSelect={() => setPosition("main")}
          preview={<Square className="h-5 w-5" />}
        />
        <OptionCard
          title={t("aiPanelRightRail", "Right Rail")}
          description={t("aiPanelRightRailDesc", "Dock on the right side")}
          selected={position === "right"}
          onSelect={() => setPosition("right")}
          preview={<PanelRight className="h-5 w-5" />}
        />
      </div>
    </fieldset>
  );
}
