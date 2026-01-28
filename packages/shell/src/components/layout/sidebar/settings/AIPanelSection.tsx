import { PanelLeft, PanelRight, Square } from "lucide-react";
import { OptionCard } from "./OptionCard";
import { SettingsSection } from "./SettingsSection";

interface AIPanelSectionProps {
  t: (key: string, defaultValue?: string) => string;
  position: "main" | "left" | "right";
  setPosition: (position: "main" | "left" | "right") => void;
  availablePositions?: Array<"main" | "left" | "right">;
}

const POSITION_OPTIONS: Record<
  "main" | "left" | "right",
  {
    titleKey: string;
    defaultTitle: string;
    descriptionKey: string;
    defaultDescription: string;
    icon: typeof PanelLeft;
  }
> = {
  left: {
    titleKey: "aiPanelLeftRail",
    defaultTitle: "Left Rail",
    descriptionKey: "aiPanelLeftRailDesc",
    defaultDescription: "Dock beside the sidebar",
    icon: PanelLeft,
  },
  main: {
    titleKey: "aiPanelMain",
    defaultTitle: "Main",
    descriptionKey: "aiPanelMainDesc",
    defaultDescription: "Show in the primary workspace",
    icon: Square,
  },
  right: {
    titleKey: "aiPanelRightRail",
    defaultTitle: "Right Rail",
    descriptionKey: "aiPanelRightRailDesc",
    defaultDescription: "Dock on the right side",
    icon: PanelRight,
  },
};

export function AIPanelSection({
  t,
  position,
  setPosition,
  availablePositions,
}: AIPanelSectionProps) {
  const options = availablePositions ?? ["left", "main", "right"];
  const label = t("aiPanelPosition", "AI Panel");
  return (
    <SettingsSection id="ai-panel-position-label" label={label}>
      <div
        className="grid gap-2 w-full min-w-0"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const config = POSITION_OPTIONS[option];
          const Icon = config.icon;
          return (
            <OptionCard
              key={option}
              title={t(config.titleKey, config.defaultTitle)}
              description={t(config.descriptionKey, config.defaultDescription)}
              selected={position === option}
              onSelect={() => setPosition(option)}
              preview={<Icon className="h-5 w-5" aria-hidden="true" />}
            />
          );
        })}
      </div>
    </SettingsSection>
  );
}
