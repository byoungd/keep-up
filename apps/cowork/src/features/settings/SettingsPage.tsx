import React from "react";
import {
  type CoworkProvider,
  type CoworkSettings,
  deleteProviderKey,
  type GymReport,
  getGymReport,
  getSettings,
  listProviders,
  setProviderKey,
  updateSettings,
} from "../../api/coworkApi";
import { useTheme } from "../../app/providers/ThemeProvider";
import { cn } from "../../lib/cn";
import { config } from "../../lib/config";

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

type GymState = {
  report: GymReport | null;
  isLoading: boolean;
  error: string | null;
};

type ProviderKeyCardProps = {
  provider: CoworkProvider;
  inputValue: string;
  isSaving: boolean;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

type ProviderSectionProps = {
  state: ProviderState;
  onInputChange: (providerId: string, value: string) => void;
  onSave: (providerId: string) => void;
  onDelete: (providerId: string) => void;
};

type SettingsErrorsProps = {
  settingsError: string | null;
  saveError: string | null;
  providerError: string | null;
};

type ModelSectionProps = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

type ThemeSectionProps = {
  theme: "light" | "dark";
  onChange: (theme: "light" | "dark") => void;
  disabled: boolean;
};

type GymReportSectionProps = {
  gymState: GymState;
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
    ? "bg-success/10 text-success"
    : "bg-surface-1 text-muted-foreground";

  return (
    <div className="rounded-md border border-border/60 bg-surface-0 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{provider.name}</p>
          {provider.description ? (
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          ) : null}
        </div>
        <span className={cn("text-fine px-2 py-1 rounded-full", statusClass)}>{statusLabel}</span>
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
          className="px-3 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-60"
          onClick={onSave}
          disabled={isSaving || inputValue.trim().length === 0}
        >
          Save Key
        </button>
        {canDelete ? (
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
            onClick={onDelete}
            disabled={isSaving}
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-fine text-muted-foreground">
        {provider.lastValidatedAt ? (
          <span>Last validated {new Date(provider.lastValidatedAt).toLocaleString()}</span>
        ) : null}
        {provider.source === "env" ? <span>Key loaded from environment variables.</span> : null}
      </div>
    </div>
  );
}

function SettingsErrors({ settingsError, saveError, providerError }: SettingsErrorsProps) {
  return (
    <>
      {settingsError ? (
        <div className="text-xs text-destructive px-1 mb-2">{settingsError}</div>
      ) : null}
      {saveError ? <div className="text-xs text-destructive px-1 mb-2">{saveError}</div> : null}
      {providerError ? (
        <div className="text-xs text-destructive px-1 mb-2">{providerError}</div>
      ) : null}
    </>
  );
}

function ProvidersSection({ state, onInputChange, onSave, onDelete }: ProviderSectionProps) {
  return (
    <section className="card-panel space-y-6">
      <div>
        <p className="text-sm font-semibold text-foreground">API Keys</p>
        <p className="text-xs text-muted-foreground">
          Stored securely on the server. Environment keys stay server-side.
        </p>
      </div>
      {state.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading providers…
        </div>
      ) : (
        <div className="space-y-3">
          {state.providers.map((provider) => (
            <ProviderKeyCard
              key={provider.id}
              provider={provider}
              inputValue={state.inputs[provider.id] ?? ""}
              isSaving={state.saving[provider.id] ?? false}
              onInputChange={(value) => onInputChange(provider.id, value)}
              onSave={() => onSave(provider.id)}
              onDelete={() => onDelete(provider.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ModelSection({ value, onChange, disabled }: ModelSectionProps) {
  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Model Selection</p>
        <p className="text-xs text-muted-foreground">Default model for new sessions.</p>
      </div>
      <select
        className="text-input"
        aria-label="Default model"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="gpt-4.1">GPT-4.1</option>
        <option value="claude-3.7">Claude 3.7 Sonnet</option>
        <option value="o4-mini">O4 Mini</option>
        <option value="deepseek-r1">DeepSeek R1</option>
        <option value="gemini-3-pro-high">Gemini 3 Pro High</option>
        <option value="gemini-3-flash">Gemini 3 Flash</option>
      </select>
    </section>
  );
}

function ThemeSection({ theme, onChange, disabled }: ThemeSectionProps) {
  return (
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
            onClick={() => onChange(mode)}
            aria-label={`Switch to ${mode} mode`}
            aria-pressed={theme === mode}
            disabled={disabled}
          >
            {mode === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>
    </section>
  );
}

function GymReportSection({ gymState }: GymReportSectionProps) {
  if (!config.devTools) {
    return null;
  }

  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">KeepUpGym</p>
        <p className="text-xs text-muted-foreground">Latest benchmark report snapshot.</p>
      </div>
      {gymState.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading gym report…
        </div>
      ) : gymState.error ? (
        <div className="text-xs text-destructive">{gymState.error}</div>
      ) : gymState.report ? (
        <GymReportDetails report={gymState.report} />
      ) : (
        <div className="text-xs text-muted-foreground">
          No report found. Run `pnpm --filter @ku0/agent-gym gym:ci`.
        </div>
      )}
    </section>
  );
}

function GymReportDetails({ report }: { report: GymReport }) {
  const metrics = buildGymMetrics(report);

  return (
    <div className="grid gap-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground">
        <span>IQ Score</span>
        <span className="font-semibold">{metrics.iqScore}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Pass Rate</span>
        <span>{metrics.passRate}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Completed</span>
        <span>{metrics.completed}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Duration</span>
        <span>{metrics.duration}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Avg Turns</span>
        <span>{metrics.avgTurns}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Avg Tool Calls</span>
        <span>{metrics.avgToolCalls}</span>
      </div>
      <div className="text-[11px] text-muted-foreground/80">Updated {metrics.updatedAt}</div>
    </div>
  );
}

function buildGymMetrics(report: GymReport) {
  const summary = report.summary?.total;
  const passRate = summary ? formatPercent(summary.passRate) : "N/A";
  const duration = summary ? formatSeconds(summary.durationMs) : "N/A";
  const avgTurns = summary ? summary.avgTurns.toFixed(1) : "N/A";
  const avgToolCalls = summary ? summary.avgToolCalls.toFixed(1) : "N/A";
  const iqScore = summary?.iqScore ?? "N/A";
  const completed = summary ? `${summary.passed}/${summary.total}` : "N/A";
  const updatedAt = new Date(report.finishedAt).toLocaleString();

  return {
    passRate,
    duration,
    avgTurns,
    avgToolCalls,
    iqScore,
    completed,
    updatedAt,
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(valueMs: number): string {
  return `${(valueMs / 1000).toFixed(1)}s`;
}

function useSettingsState() {
  const { theme, setTheme } = useTheme();
  const [state, setState] = React.useState<SettingsState>({
    data: { defaultModel: "gpt-4.1", memoryProfile: "default" },
    isLoading: true,
    error: null,
    isSaving: false,
    saveError: null,
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

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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

  return { state, theme, handleUpdate, handleThemeChange };
}

function useProviderState() {
  const [providerState, setProviderState] = React.useState<ProviderState>({
    providers: [],
    inputs: {},
    isLoading: true,
    error: null,
    saving: {},
  });

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
    void loadProviders();
  }, [loadProviders]);

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

  return {
    providerState,
    handleProviderInputChange,
    handleProviderSave,
    handleProviderDelete,
  };
}

function useGymReportState() {
  const [gymState, setGymState] = React.useState<GymState>({
    report: null,
    isLoading: config.devTools,
    error: null,
  });

  const loadGymReport = React.useCallback(async () => {
    if (!config.devTools) {
      setGymState({ report: null, isLoading: false, error: null });
      return;
    }
    try {
      const report = await getGymReport();
      setGymState({ report, isLoading: false, error: null });
    } catch (err) {
      setGymState({
        report: null,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load gym report",
      });
    }
  }, []);

  React.useEffect(() => {
    void loadGymReport();
  }, [loadGymReport]);

  return gymState;
}

export function SettingsPage() {
  const { state, theme, handleUpdate, handleThemeChange } = useSettingsState();
  const { providerState, handleProviderInputChange, handleProviderSave, handleProviderDelete } =
    useProviderState();
  const gymState = useGymReportState();

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
      <SettingsErrors
        settingsError={state.error}
        saveError={state.saveError}
        providerError={providerState.error}
      />

      <ProvidersSection
        state={providerState}
        onInputChange={handleProviderInputChange}
        onSave={handleProviderSave}
        onDelete={handleProviderDelete}
      />

      <ModelSection
        value={state.data.defaultModel ?? "gpt-4.1"}
        onChange={(value) => handleUpdate({ defaultModel: value })}
        disabled={state.isSaving}
      />

      <section className="card-panel space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Memory Profile</p>
          <p className="text-xs text-muted-foreground">
            Choose which lesson set the agent should load by default.
          </p>
        </div>
        <select
          className="text-input"
          aria-label="Memory profile"
          value={state.data.memoryProfile ?? "default"}
          onChange={(event) =>
            handleUpdate({
              memoryProfile: event.target.value as SettingsState["data"]["memoryProfile"],
            })
          }
          disabled={state.isSaving}
        >
          <option value="default">Default</option>
          <option value="strict-reviewer">Strict Reviewer</option>
          <option value="creative-prototyper">Creative Prototyper</option>
        </select>
      </section>

      <ThemeSection theme={theme} onChange={handleThemeChange} disabled={state.isSaving} />

      <GymReportSection gymState={gymState} />
    </div>
  );
}
