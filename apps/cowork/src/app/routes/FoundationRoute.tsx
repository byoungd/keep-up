import { Sparkles } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Badge, Button, Card, InputCapsule, StatusDot, ThinkingBar } from "../../components/ui";

const THEME_TOKEN_KEYS = [
  "--color-background",
  "--color-foreground",
  "--color-muted",
  "--color-muted-foreground",
  "--color-border",
  "--color-input",
  "--color-ring",
  "--color-primary",
  "--color-primary-foreground",
  "--color-theme-base",
  "--color-sidebar",
  "--color-canvas",
  "--color-surface-0",
  "--color-surface-1",
  "--color-surface-2",
  "--color-surface-3",
  "--color-surface-elevated",
  "--color-accent-ai",
  "--color-accent-indigo",
  "--color-success",
  "--color-warning",
  "--color-info",
  "--color-error",
] as const;

type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];

function useThemeTokens(mode: "light" | "dark"): CSSProperties {
  const [tokens, setTokens] = useState<CSSProperties>({ colorScheme: mode });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const probe = document.createElement("div");
    if (mode === "dark") {
      probe.classList.add("dark");
    }
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe);
    const next: CSSProperties = { colorScheme: mode };

    for (const key of THEME_TOKEN_KEYS) {
      const value = computed.getPropertyValue(key).trim();
      if (value) {
        (next as Record<ThemeTokenKey, string>)[key] = value;
      }
    }

    probe.remove();
    setTokens(next);
  }, [mode]);

  return tokens;
}

interface ThemePreviewProps {
  title: string;
  style: CSSProperties;
}

function ThemePreview({ title, style }: ThemePreviewProps) {
  return (
    <div style={style} className="space-y-3">
      <p className="text-chrome font-semibold text-muted-foreground">{title}</p>
      <div className="rounded-2xl bg-theme p-3">
        <div className="rounded-xl bg-canvas p-5 shadow-sm space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge>Stable</Badge>
            <Badge tone="success">Synced</Badge>
            <Badge tone="warning">Latency 120ms</Badge>
            <Badge tone="info">Streaming</Badge>
            <Badge tone="ai">AI Ready</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-chrome font-semibold text-foreground">Session health</p>
                    <p className="text-fine text-muted-foreground">All checks passing.</p>
                  </div>
                  <StatusDot tone="success" aria-label="Healthy" />
                </div>
                <ThinkingBar />
              </div>
            </Card>

            <Card tone="subtle">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusDot tone="warning" aria-label="Pending" />
                  <p className="text-chrome font-semibold text-foreground">Approvals</p>
                </div>
                <p className="text-content text-muted-foreground">
                  Three approvals queued for review.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm">Review</Button>
                  <Button variant="ghost" size="sm">
                    Snooze
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-surface-1/70 p-4 space-y-3">
              <p className="text-fine font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Centered capsule
              </p>
              <div className="grid place-items-center">
                <InputCapsule
                  position="center"
                  ariaLabel="Centered command input"
                  autoFocus={false}
                  placeholder="Ask anything..."
                />
              </div>
            </div>
            <div className="rounded-xl bg-surface-1/70 p-4 space-y-3">
              <p className="text-fine font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Docked capsule
              </p>
              <div className="relative h-28 rounded-lg bg-surface-2/70">
                <InputCapsule
                  position="dock"
                  ariaLabel="Docked command input"
                  autoFocus={false}
                  placeholder="Continue the thread..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FoundationRoute() {
  const lightThemeTokens = useThemeTokens("light");
  const darkThemeTokens = useThemeTokens("dark");

  return (
    <div className="page-grid">
      <section className="rounded-2xl border border-border/70 bg-linear-to-br from-surface-1 via-surface-0 to-surface-2 p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-fine font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              Tuesday Morning Foundation
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Arc frame, Dia capsule, AI-only novelty.
            </h1>
            <p className="text-content text-muted-foreground">
              Structural shell and primitives ready for parallel feature tracks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="magic">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ask AI
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ThemePreview title="Light Mode" style={lightThemeTokens} />
        <ThemePreview title="Dark Mode" style={darkThemeTokens} />
      </section>
    </div>
  );
}
