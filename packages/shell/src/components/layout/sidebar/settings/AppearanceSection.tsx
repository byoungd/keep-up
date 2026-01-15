import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { OptionCard } from "./OptionCard";

interface AppearanceSectionProps {
  t: (key: string, defaultValue?: string) => string;
}

export function AppearanceSection({ t }: AppearanceSectionProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <fieldset
      className="grid items-center gap-2 rounded-xl border border-border/40 bg-surface-1/30 p-3"
      style={{ gridTemplateColumns: "auto 1fr" }}
      aria-labelledby="theme-mode-label"
    >
      <legend className="sr-only">{t("themeMode", "Theme")}</legend>
      <span
        id="theme-mode-label"
        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 whitespace-nowrap self-center"
      >
        {t("themeMode", "Theme")}
      </span>
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
    </fieldset>
  );
}
