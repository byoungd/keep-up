import React from "react";
import {
  type CoworkProvider,
  type CoworkSettings,
  deleteProviderKey,
  getSettings,
  listProviders,
  setProviderKey,
  updateSettings,
} from "../../api/coworkApi";
import { useTheme } from "../../app/providers/ThemeProvider";
import { cn } from "../../lib/cn";

type SettingsState = {
  data: CoworkSettings;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  saveError: string | null;
};

type ProviderState = {
  providers: CoworkProvider[];
  inputs: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  saving: Record<string, boolean>;
};

type ProviderKeyCardProps = {
  provider: CoworkProvider;
  inputValue: string;
  isSaving: boolean;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

function ProviderKeyCard({
  provider,
  inputValue,
  isSaving,
  onInputChange,
  onSave,
  onDelete,
}: ProviderKeyCardProps) {
  const canDelete = provider.hasKey && provider.source === "settings";
  const statusLabel = provider.hasKey ? (provider.source === "env" ? "Env" : "Stored") : "No key";
  const statusClass = provider.hasKey
    ? "bg-emerald-100 text-emerald-700"
    : "bg-surface-100 text-muted-foreground";

  return (
    <div className="rounded-md border border-border/60 bg-surface-0 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{provider.name}</p>
          {provider.description ? (
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          ) : null}
        </div>
        <span className={cn("text-[11px] px-2 py-1 rounded-full", statusClass)}>{statusLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`${provider.name} API key`}
          type="password"
          className="text-input flex-1 min-w-[220px]"
          placeholder="Enter API key"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          disabled={isSaving}
        />
        <button
          type="button"
          className="px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-60"
          onClick={onSave}
          disabled={isSaving || inputValue.trim().length === 0}
        >
          Save Key
        </button>
        {canDelete ? (
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-100 transition-colors disabled:opacity-60"
            onClick={onDelete}
            disabled={isSaving}
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {provider.lastValidatedAt ? (
          <span>Last validated {new Date(provider.lastValidatedAt).toLocaleString()}</span>
        ) : null}
        {provider.source === "env" ? <span>Key loaded from environment variables.</span> : null}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [state, setState] = React.useState<SettingsState>({
    data: { defaultModel: "gpt-4.1" },
    isLoading: true,
    error: null,
    isSaving: false,
    saveError: null,
  });
  const [providerState, setProviderState] = React.useState<ProviderState>({
    providers: [],
    inputs: {},
    isLoading: true,
    error: null,
    saving: {},
  });

  const loadSettings = React.useCallback(async () => {
    try {
      const settings = await getSettings();
      setState((prev) => ({
        ...prev,
        data: { ...prev.data, ...settings },
        isLoading: false,
        error: null,
      }));
      if (settings.theme) {
        setTheme(settings.theme);
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load settings",
      }));
    }
  }, [setTheme]);

  const loadProviders = React.useCallback(async () => {
    setProviderState((prev) => ({ ...prev, isLoading: true }));
    try {
      const providers = await listProviders();
      setProviderState((prev) => ({
        ...prev,
        providers,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      setProviderState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load providers",
      }));
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
    void loadProviders();
  }, [loadProviders, loadSettings]);

  const handleUpdate = React.useCallback(async (patch: Partial<CoworkSettings>) => {
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
      setState((prev) => ({
        ...prev,
        isSaving: false,
        saveError: err instanceof Error ? err.message : "Failed to save",
      }));
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

  const handleProviderInputChange = React.useCallback((providerId: string, value: string) => {
    setProviderState((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [providerId]: value },
    }));
  }, []);

  const handleProviderSave = React.useCallback(
    async (providerId: string) => {
      const key = providerState.inputs[providerId]?.trim();
      if (!key) {
        return;
      }
      setProviderState((prev) => ({
        ...prev,
        saving: { ...prev.saving, [providerId]: true },
        error: null,
      }));
      try {
        await setProviderKey(providerId, key);
        setProviderState((prev) => ({
          ...prev,
          inputs: { ...prev.inputs, [providerId]: "" },
        }));
        await loadProviders();
      } catch (err) {
        setProviderState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to save key",
        }));
      } finally {
        setProviderState((prev) => ({
          ...prev,
          saving: { ...prev.saving, [providerId]: false },
        }));
      }
    },
    [loadProviders, providerState.inputs]
  );

  const handleProviderDelete = React.useCallback(
    async (providerId: string) => {
      setProviderState((prev) => ({
        ...prev,
        saving: { ...prev.saving, [providerId]: true },
        error: null,
      }));
      try {
        await deleteProviderKey(providerId);
        await loadProviders();
      } catch (err) {
        setProviderState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to delete key",
        }));
      } finally {
        setProviderState((prev) => ({
          ...prev,
          saving: { ...prev.saving, [providerId]: false },
        }));
      }
    },
    [loadProviders]
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
      {providerState.error && (
        <div className="text-xs text-destructive px-1 mb-2">{providerState.error}</div>
      )}

      <section className="card-panel space-y-6">
        <div>
          <p className="text-sm font-semibold text-foreground">API Keys</p>
          <p className="text-xs text-muted-foreground">
            Stored securely on the server. Environment keys stay server-side.
          </p>
        </div>
        {providerState.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading providers…
          </div>
        ) : (
          <div className="space-y-3">
            {providerState.providers.map((provider) => (
              <ProviderKeyCard
                key={provider.id}
                provider={provider}
                inputValue={providerState.inputs[provider.id] ?? ""}
                isSaving={providerState.saving[provider.id] ?? false}
                onInputChange={(value) => handleProviderInputChange(provider.id, value)}
                onSave={() => handleProviderSave(provider.id)}
                onDelete={() => handleProviderDelete(provider.id)}
              />
            ))}
          </div>
        )}
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
          <option value="gemini-3-pro-high">Gemini 3 Pro High</option>
          <option value="gemini-3-flash">Gemini 3 Flash</option>
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
