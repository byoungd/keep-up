"use client";
import { cn } from "@ku0/shared/utils";
import { Monitor, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import {
  type ReaderCanvasTone,
  useReaderPreferences,
} from "../../context/ReaderPreferencesContext";
import { useShellI18n } from "../../context/ReaderShellContext";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Slider } from "../ui/Slider";

interface AppearanceMenuProps {
  onClose: () => void;
}

export function AppearanceMenu({ onClose }: AppearanceMenuProps) {
  const { theme, setTheme } = useTheme();
  const i18n = useShellI18n();
  const t = (key: string) => i18n.t(`AppearanceMenu.${key}`, key);
  const { preferences, setFontFamily, setFontSize, setLineHeight, setCanvas } =
    useReaderPreferences();
  const [mounted, setMounted] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const { fontSize, lineHeight, fontFamily, canvas } = preferences;

  const canvasOptions = [
    { value: "default", color: "bg-surface-0", label: t("canvasDefault") },
    { value: "warm", color: "bg-canvas-warm", label: t("canvasWarm") },
    { value: "mint", color: "bg-canvas-mint", label: t("canvasMint") },
    { value: "sepia", color: "bg-canvas-sepia", label: t("canvasSepia") },
    { value: "dark", color: "bg-canvas-dark", label: t("canvasDark") },
  ] satisfies Array<{ value: ReaderCanvasTone; color: string; label: string }>;

  React.useEffect(() => {
    setMounted(true);

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  if (!mounted) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="absolute top-12 right-0 w-[280px] bg-surface-1 border border-border/20 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-normal"
    >
      {/* Header - minimal */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <span className="text-xs font-semibold text-muted-foreground">{t("title")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-surface-2 transition-colors duration-fast"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Theme */}
        <Section label={t("theme")}>
          <SegmentedControl
            value={theme || "system"}
            onValueChange={setTheme}
            items={[
              {
                value: "light",
                label: t("light"),
                icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" />,
              },
              {
                value: "system",
                label: t("auto"),
                icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" />,
              },
              {
                value: "dark",
                label: t("dark"),
                icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" />,
              },
            ]}
          />
        </Section>

        {/* Typeface */}
        <Section label={t("typeface")}>
          <div className="flex gap-2">
            <TypefaceButton
              label={t("serif")}
              active={fontFamily === "serif"}
              onClick={() => setFontFamily("serif")}
              fontClass="font-serif"
            />
            <TypefaceButton
              label={t("sans")}
              active={fontFamily === "sans"}
              onClick={() => setFontFamily("sans")}
              fontClass="font-sans"
            />
          </div>
        </Section>

        {/* Font Size */}
        <Section label={t("size")} value={`${fontSize}px`}>
          <Slider value={fontSize} min={14} max={24} step={1} onChange={setFontSize} />
        </Section>

        {/* Line Height */}
        <Section label={t("lineHeight")} value={lineHeight.toFixed(1)}>
          <Slider value={lineHeight} min={1.2} max={2.0} step={0.1} onChange={setLineHeight} />
        </Section>

        {/* Canvas */}
        <Section label={t("canvas")}>
          <div className="flex gap-2">
            {canvasOptions.map((bg) => (
              <button
                key={bg.value}
                type="button"
                onClick={() => setCanvas(bg.value)}
                title={bg.label}
                aria-label={bg.label}
                aria-pressed={canvas === bg.value}
                className={cn(
                  "h-6 w-6 rounded-full transition-all duration-fast",
                  bg.color,
                  canvas === bg.value
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-1"
                    : "ring-1 ring-border/30 hover:ring-border/60"
                )}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// Section wrapper with label and optional value display
interface SectionProps {
  label: string;
  value?: string;
  children: React.ReactNode;
}

function Section({ label, value, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {value && <span className="text-micro font-mono text-muted-foreground/70">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// Compact typeface selection button
interface TypefaceButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  fontClass: string;
}

function TypefaceButton({ label, active, onClick, fontClass }: TypefaceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-fast",
        fontClass,
        active
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3 border border-transparent"
      )}
    >
      {label}
    </button>
  );
}
