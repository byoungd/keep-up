import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { OptionCard } from "./OptionCard";
import { SettingsSection } from "./SettingsSection";

interface AppearanceSectionProps {
  t: (key: string, defaultValue?: string) => string;
}

export function AppearanceSection({ t }: AppearanceSectionProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const label = t("themeMode", "Theme");

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SettingsSection id="theme-mode-label" label={label} labelWidth="5rem">
      <div className="grid grid-cols-3 gap-2 w-full min-w-0">
        <OptionCard
          title={t("themeLight", "Light")}
          description={t("themeLightDesc", "Classic light")}
          selected={mounted && theme === "light"}
          onSelect={() => setTheme("light")}
          preview={<Sun className="h-5 w-5" />}
        />
        <OptionCard
          title={t("themeSystem", "System")}
          description={t("themeSystemDesc", "Follow OS")}
          selected={mounted && theme === "system"}
          onSelect={() => setTheme("system")}
          preview={<Monitor className="h-5 w-5" />}
        />
        <OptionCard
          title={t("themeDark", "Dark")}
          description={t("themeDarkDesc", "Classic dark")}
          selected={mounted && theme === "dark"}
          onSelect={() => setTheme("dark")}
          preview={<Moon className="h-5 w-5" />}
        />
      </div>
    </SettingsSection>
  );
}
