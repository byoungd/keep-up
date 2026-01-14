"use client";

import { Button } from "@/components/ui/Button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/Panel";
import { cn } from "@ku0/shared/utils";
import { AlignJustify, Monitor, Moon, Sun, Type, X } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

interface AppearancePanelProps {
  onClose: () => void;
}

export function AppearancePanel({ onClose }: AppearancePanelProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Panel className="h-full border-none rounded-none shadow-none bg-transparent flex flex-col">
      <PanelHeader className="flex flex-row items-center justify-between px-6 py-5 border-b border-border/40 shrink-0">
        <PanelTitle className="text-sm font-semibold text-foreground tracking-tight">
          Appearance
        </PanelTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 opacity-60 hover:opacity-100"
          aria-label="Close appearance panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </PanelHeader>

      <PanelContent className="p-6 space-y-8 overflow-y-auto flex-1">
        {/* Theme Group */}
        <div className="space-y-3">
          <Label>Theme Mode</Label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-lg border border-border/50">
            {["light", "system", "dark"].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                  theme === t
                    ? "bg-background shadow-sm text-foreground ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                )}
              >
                {t === "light" && <Sun className="h-3.5 w-3.5" />}
                {t === "system" && <Monitor className="h-3.5 w-3.5" />}
                {t === "dark" && <Moon className="h-3.5 w-3.5" />}
                <span className="capitalize">{t}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Typography Group */}
        <div className="space-y-6">
          <div className="space-y-3">
            <Label>Font Family</Label>
            <div className="flex items-center justify-between px-3 py-2.5 bg-background/50 border border-border/50 rounded-lg cursor-pointer hover:bg-background/80 hover:border-primary/20 transition-all group">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-muted/50 flex items-center justify-center text-sm font-serif text-foreground/80 group-hover:text-foreground transition-colors">
                  Ag
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">Merriweather</span>
                  <span className="text-[10px] text-muted-foreground">Serif for reading</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground/80 transition-colors" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Font Size</Label>
              <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                18px
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Type className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <div className="flex-1 h-6 flex items-center">
                <input
                  type="range"
                  aria-label="Font size"
                  className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
                />
              </div>
              <Type className="h-5 w-5 text-foreground" aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Line Height</Label>
              <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                1.6
              </span>
            </div>
            <div className="flex items-center gap-4">
              <AlignJustify className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <div className="flex-1 h-6 flex items-center">
                <input
                  type="range"
                  aria-label="Line height"
                  className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
                />
              </div>
              <AlignJustify className="h-5 w-5 text-foreground" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Page Background */}
        <div className="space-y-3">
          <Label>Canvas Color</Label>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Canvas color">
            {[
              { color: "bg-surface-0", border: "border-border/50", name: "Default" },
              { color: "bg-canvas-warm", border: "border-border/50", name: "Warm" },
              { color: "bg-canvas-mint", border: "border-border/50", name: "Mint" },
              { color: "bg-canvas-sepia", border: "border-border/50", name: "Sepia" },
              { color: "bg-canvas-dark", border: "border-border/50", name: "Dark" },
            ].map((bg) => (
              <button
                key={bg.color}
                type="button"
                aria-label={bg.name}
                className={cn(
                  "h-8 w-8 rounded-full border cursor-pointer transition-all hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  bg.color,
                  bg.border
                )}
              />
            ))}
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
      {children}
    </span>
  );
}

type ChevronRightProps = React.SVGProps<SVGSVGElement>;

function ChevronRight(props: ChevronRightProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
