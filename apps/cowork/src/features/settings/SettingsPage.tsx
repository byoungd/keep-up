import React from "react";
import { type CoworkSettings, getSettings, updateSettings } from "../../api/coworkApi";
import { useTheme } from "../../app/providers/ThemeProvider";
import { cn } from "../../lib/cn";

type SettingsState = {
  data: CoworkSettings;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  saveError: string | null;
};

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [state, setState] = React.useState<SettingsState>({
    data: { defaultModel: "gpt-4.1" },
    isLoading: true,
    error: null,
    isSaving: false,
    saveError: null,
  });

  // Load settings on mount
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            data: { ...prev.data, ...settings },
            isLoading: false,
            error: null,
          }));
          // Sync theme from server if present
          if (settings.theme) {
            setTheme(settings.theme);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : "Failed to load settings",
          }));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setTheme]);

  // Optimistic update helper
  const handleUpdate = React.useCallback(async (patch: Partial<CoworkSettings>) => {
    // Optimistic update
    setState((prev) => ({
      ...prev,
      data: { ...prev.data, ...patch },
      saveError: null,
      isSaving: true,
    }));

    try {
      const updated = await updateSettings(patch);
      setState((prev) => ({
        ...prev,
        data: { ...prev.data, ...updated },
        isSaving: false,
      }));
    } catch (err) {
      // Revert on error - refetch to get actual state
      setState((prev) => ({
        ...prev,
        isSaving: false,
        saveError: err instanceof Error ? err.message : "Failed to save",
      }));
      // Refetch to revert optimistic update
      try {
        const settings = await getSettings();
        setState((prev) => ({
          ...prev,
          data: { ...prev.data, ...settings },
        }));
      } catch {
        // Ignore refetch errors
      }
    }
  }, []);

  const handleThemeChange = React.useCallback(
    (newTheme: "light" | "dark") => {
      setTheme(newTheme);
      handleUpdate({ theme: newTheme });
    },
    [setTheme, handleUpdate]
  );

  if (state.isLoading) {
    return (
      <div className="page-grid">
        <section className="card-panel flex items-center justify-center py-12">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </section>
      </div>
    );
  }

  return (
    <div className="page-grid">
      {state.error && <div className="text-xs text-destructive px-1 mb-2">{state.error}</div>}
      {state.saveError && (
        <div className="text-xs text-destructive px-1 mb-2">{state.saveError}</div>
      )}

      <section className="card-panel space-y-6">
        <div>
          <p className="text-sm font-semibold text-foreground">API Keys</p>
          <p className="text-xs text-muted-foreground">
            Stored securely on the server. Never exposed to client.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="openai-key" className="text-xs font-medium text-muted-foreground">
              OpenAI API Key
            </label>
            <input
              id="openai-key"
              aria-label="OpenAI API key"
              type="password"
              className="text-input"
              placeholder="sk-..."
              value={state.data.openAiKey ?? ""}
              onChange={(event) => handleUpdate({ openAiKey: event.target.value })}
              disabled={state.isSaving}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="anthropic-key" className="text-xs font-medium text-muted-foreground">
              Anthropic API Key
            </label>
            <input
              id="anthropic-key"
              aria-label="Anthropic API key"
              type="password"
              className="text-input"
              placeholder="sk-ant-..."
              value={state.data.anthropicKey ?? ""}
              onChange={(event) => handleUpdate({ anthropicKey: event.target.value })}
              disabled={state.isSaving}
            />
          </div>
        </div>
      </section>

      <section className="card-panel space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Model Selection</p>
          <p className="text-xs text-muted-foreground">Default model for new sessions.</p>
        </div>
        <select
          className="text-input"
          aria-label="Default model"
          value={state.data.defaultModel ?? "gpt-4.1"}
          onChange={(event) => handleUpdate({ defaultModel: event.target.value })}
          disabled={state.isSaving}
        >
          <option value="gpt-4.1">GPT-4.1</option>
          <option value="claude-3.7">Claude 3.7 Sonnet</option>
          <option value="o4-mini">O4 Mini</option>
          <option value="deepseek-r1">DeepSeek R1</option>
        </select>
      </section>

      <section className="card-panel space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Theme</p>
          <p className="text-xs text-muted-foreground">Toggle dark mode for the Cowork UI shell.</p>
        </div>
        <div className="theme-toggle-group">
          {(["light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn("theme-toggle", theme === mode && "theme-toggle--active")}
              onClick={() => handleThemeChange(mode)}
              aria-label={`Switch to ${mode} mode`}
              aria-pressed={theme === mode}
              disabled={state.isSaving}
            >
              {mode === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
