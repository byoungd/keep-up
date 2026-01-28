import React from "react";
import {
  type CoworkAuditAction,
  type CoworkAuditEntry,
  type CoworkCheckpointFilter,
  type CoworkCheckpointRestoreResult,
  type CoworkCheckpointSummary,
  type CoworkPolicySource,
  type CoworkProvider,
  type CoworkSettings,
  deleteCheckpoint,
  deleteProviderKey,
  exportPolicyToRepo,
  type GymReport,
  getGymReport,
  getPolicyResolution,
  getSettings,
  listCheckpoints,
  listProviders,
  queryAuditLogs,
  restoreCheckpoint,
  setProviderKey,
  updateSettings,
} from "../../api/coworkApi";
import { useTheme } from "../../app/providers/ThemeProvider";
import { cn } from "../../lib/cn";
import { config } from "../../lib/config";
import { LocalVectorStoreSection } from "../memory/components/LocalVectorStoreSection";

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

type PolicyState = {
  policy: CoworkSettings["policy"];
  source: CoworkPolicySource | null;
  reason: string | null;
  draft: string;
  isDirty: boolean;
  isLoading: boolean;
  isExporting: boolean;
  exportPath: string | null;
  error: string | null;
  exportError: string | null;
};

type AuditLogState = {
  entries: CoworkAuditEntry[];
  sessionId: string;
  action: CoworkAuditAction | "all";
  isLoading: boolean;
  error: string | null;
};

type CheckpointState = {
  checkpoints: CoworkCheckpointSummary[];
  sessionId: string;
  isLoading: boolean;
  error: string | null;
  restoringId?: string;
  deletingId?: string;
  lastRestore?: CoworkCheckpointRestoreResult | null;
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

type ContextCompressionSectionProps = {
  value?: CoworkSettings["contextCompression"];
  onChange: (value: CoworkSettings["contextCompression"]) => void;
  disabled: boolean;
};

type ThemeSectionProps = {
  theme: "light" | "dark";
  onChange: (theme: "light" | "dark") => void;
  disabled: boolean;
};

type DataSovereigntySectionProps = {
  settings: CoworkSettings;
  isSaving: boolean;
  onImport: (patch: Partial<CoworkSettings>) => Promise<void>;
};

type GymReportSectionProps = {
  gymState: GymState;
};

type PolicySectionProps = {
  policyState: PolicyState;
  caseInsensitivePaths: boolean;
  isSaving: boolean;
  editorError: string | null;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onExport: () => void;
  onToggleCaseInsensitive: (value: boolean) => void;
};

type AuditLogSectionProps = {
  auditState: AuditLogState;
  onSessionChange: (value: string) => void;
  onActionChange: (value: CoworkAuditAction | "all") => void;
  onRefresh: () => void;
};

type CheckpointSectionProps = {
  checkpointState: CheckpointState;
  onSessionChange: (value: string) => void;
  onRefresh: () => void;
  onRestore: (checkpointId: string) => void;
  onDelete: (checkpointId: string) => void;
};

const SETTINGS_TABS = [
  {
    id: "providers",
    label: "Providers",
    description: "Keys and connectivity",
  },
  {
    id: "models",
    label: "Models",
    description: "Defaults and memory",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and canvas",
  },
  {
    id: "data",
    label: "Data",
    description: "Import and export",
  },
  {
    id: "policy",
    label: "Policy",
    description: "Governance and rules",
  },
  {
    id: "audit",
    label: "Audit",
    description: "Logs and approvals",
  },
  {
    id: "checkpoints",
    label: "Checkpoints",
    description: "Snapshots and restore",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Benchmarks and health",
  },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

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
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full" />
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

function ContextCompressionSection({ value, onChange, disabled }: ContextCompressionSectionProps) {
  const config = value ?? {};

  const updateConfig = React.useCallback(
    (partial: Partial<NonNullable<CoworkSettings["contextCompression"]>>) => {
      const next: Record<string, unknown> = { ...config, ...partial };
      for (const key of Object.keys(next)) {
        if (next[key] === undefined || next[key] === null || next[key] === "") {
          delete next[key];
        }
      }
      onChange(Object.keys(next).length > 0 ? (next as CoworkSettings["contextCompression"]) : {});
    },
    [config, onChange]
  );

  const parseNumber = (raw: string): number | undefined => {
    if (!raw.trim()) {
      return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Context Compaction</p>
        <p className="text-xs text-muted-foreground">
          Configure when long sessions are summarized to stay within model limits.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Max tokens</span>
          <input
            aria-label="Context max tokens"
            type="number"
            inputMode="numeric"
            className="text-input"
            placeholder="Auto"
            value={config.maxTokens ?? ""}
            onChange={(event) => updateConfig({ maxTokens: parseNumber(event.target.value) })}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Compression threshold (0-1)</span>
          <input
            aria-label="Context compression threshold"
            type="number"
            step="0.05"
            min="0"
            max="1"
            className="text-input"
            placeholder="0.8"
            value={config.compressionThreshold ?? ""}
            onChange={(event) =>
              updateConfig({ compressionThreshold: parseNumber(event.target.value) })
            }
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Preserve last N messages</span>
          <input
            aria-label="Context preserve count"
            type="number"
            inputMode="numeric"
            className="text-input"
            placeholder="3"
            value={config.preserveCount ?? ""}
            onChange={(event) => updateConfig({ preserveCount: parseNumber(event.target.value) })}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Minimum messages after compression</span>
          <input
            aria-label="Context minimum messages"
            type="number"
            inputMode="numeric"
            className="text-input"
            placeholder="5"
            value={config.minMessages ?? ""}
            onChange={(event) => updateConfig({ minMessages: parseNumber(event.target.value) })}
            disabled={disabled}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Strategy</span>
          <select
            aria-label="Context compaction strategy"
            className="text-input"
            value={config.strategy ?? "hybrid"}
            onChange={(event) =>
              updateConfig({
                strategy: event.target.value as NonNullable<
                  CoworkSettings["contextCompression"]
                >["strategy"],
              })
            }
            disabled={disabled}
          >
            <option value="hybrid">Hybrid</option>
            <option value="summarize">Summarize</option>
            <option value="truncate">Truncate</option>
            <option value="sliding_window">Sliding window</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            aria-label="Enable compaction summarization"
            type="checkbox"
            className="h-4 w-4"
            checked={config.enableSummarization ?? true}
            onChange={(event) => updateConfig({ enableSummarization: event.target.checked })}
            disabled={disabled}
          />
          Enable summarization
        </label>
      </div>
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

function DataSovereigntySection({ settings, isSaving, onImport }: DataSovereigntySectionProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = React.useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const handleExport = () => {
    downloadJsonFile("cowork-settings.json", {
      app: "Open Wrap",
      exportedAt: new Date().toISOString(),
      settings,
    });
    setStatus({ type: "success", message: "Settings exported to cowork-settings.json." });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const patch = parseSettingsImport(parsed);
      if (!patch) {
        setStatus({ type: "error", message: "No valid settings found in file." });
        return;
      }
      await onImport(patch);
      setStatus({ type: "success", message: "Settings imported successfully." });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to import settings.",
      });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Data Sovereignty</p>
        <p className="text-xs text-muted-foreground">
          Export your Cowork settings or import a curated configuration.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        aria-label="Import settings JSON"
        className="hidden"
        onChange={handleImport}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="secondary-button"
          onClick={handleExport}
          disabled={isSaving}
        >
          Export settings
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={handleImportClick}
          disabled={isSaving}
        >
          Import settings
        </button>
      </div>
      {status ? (
        <div
          className={cn(
            "text-xs font-medium",
            status.type === "error" ? "text-destructive" : "text-success"
          )}
        >
          {status.message}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Importing will apply supported keys only (model, theme, memory, policy, and compaction
        settings).
      </p>
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
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full" />
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

function PolicySection({
  policyState,
  caseInsensitivePaths,
  isSaving,
  editorError,
  onDraftChange,
  onSave,
  onClear,
  onExport,
  onToggleCaseInsensitive,
}: PolicySectionProps) {
  const sourceLabel = formatPolicySource(policyState.source);

  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Policy & Governance</p>
        <p className="text-xs text-muted-foreground">
          Manage Cowork policy rules, matching, and repo exports.
        </p>
      </div>

      {policyState.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full" />
          Loading policy…
        </div>
      ) : null}

      {policyState.error ? (
        <div className="text-xs text-destructive">{policyState.error}</div>
      ) : null}

      {sourceLabel ? (
        <div className="text-xs text-muted-foreground">
          Active source: <span className="text-foreground">{sourceLabel}</span>
          {policyState.reason ? ` · ${policyState.reason}` : ""}
        </div>
      ) : null}

      {policyState.source === "repo" ? (
        <div className="text-xs text-muted-foreground">
          Repo policy overrides settings until the file is removed.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-surface-0 px-3 py-2">
        <div>
          <label htmlFor="case-insensitive-paths" className="text-xs font-medium text-foreground">
            Case-insensitive paths
          </label>
          <p className="text-[11px] text-muted-foreground">
            Normalize paths when matching policy globs.
          </p>
        </div>
        <input
          id="case-insensitive-paths"
          type="checkbox"
          className="h-4 w-4"
          checked={caseInsensitivePaths}
          onChange={(event) => onToggleCaseInsensitive(event.target.checked)}
          disabled={isSaving}
        />
      </div>

      <div className="space-y-2">
        <textarea
          aria-label="Policy JSON"
          className="text-input min-h-[220px] font-mono text-[11px] leading-relaxed"
          value={policyState.draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={`{\n  "version": "1.0",\n  "defaults": { "fallback": "deny" },\n  "rules": []\n}`}
          disabled={isSaving}
        />
        {editorError ? <div className="text-xs text-destructive">{editorError}</div> : null}
        {policyState.exportError ? (
          <div className="text-xs text-destructive">{policyState.exportError}</div>
        ) : null}
        {policyState.exportPath ? (
          <div className="text-xs text-muted-foreground">Exported to {policyState.exportPath}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-60"
          onClick={onSave}
          disabled={isSaving || policyState.isLoading || policyState.draft.trim().length === 0}
        >
          Save Policy
        </button>
        <button
          type="button"
          className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
          onClick={onClear}
          disabled={isSaving || policyState.isLoading}
        >
          Clear Policy
        </button>
        <button
          type="button"
          className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
          onClick={onExport}
          disabled={policyState.isExporting || policyState.isLoading}
        >
          {policyState.isExporting ? "Exporting…" : "Export to Repo"}
        </button>
      </div>
    </section>
  );
}

function AuditLogSection({
  auditState,
  onSessionChange,
  onActionChange,
  onRefresh,
}: AuditLogSectionProps) {
  return (
    <section className="card-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Audit Logs</p>
          <p className="text-xs text-muted-foreground">
            Review recent tool calls and policy decisions.
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
          onClick={onRefresh}
          disabled={auditState.isLoading}
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Filter by session id"
          type="text"
          className="text-input min-w-[220px]"
          placeholder="Session ID (optional)"
          value={auditState.sessionId}
          onChange={(event) => onSessionChange(event.target.value)}
          disabled={auditState.isLoading}
        />
        <select
          aria-label="Filter by action"
          className="text-input min-w-[180px]"
          value={auditState.action}
          onChange={(event) => onActionChange(event.target.value as CoworkAuditAction | "all")}
          disabled={auditState.isLoading}
        >
          <option value="all">All actions</option>
          <option value="policy_decision">Policy decisions</option>
          <option value="tool_call">Tool calls</option>
          <option value="tool_result">Tool results</option>
          <option value="tool_error">Tool errors</option>
          <option value="approval_requested">Approvals requested</option>
          <option value="approval_resolved">Approvals resolved</option>
          <option value="artifact_apply">Artifact applied</option>
          <option value="artifact_revert">Artifact reverted</option>
        </select>
      </div>

      {auditState.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full" />
          Loading audit logs…
        </div>
      ) : null}

      {auditState.error ? <div className="text-xs text-destructive">{auditState.error}</div> : null}

      {!auditState.isLoading && auditState.entries.length === 0 ? (
        <div className="text-xs text-muted-foreground">No audit entries found.</div>
      ) : null}

      <div className="space-y-2">
        {auditState.entries.map((entry) => (
          <div
            key={entry.entryId}
            className="rounded-md border border-border/60 bg-surface-0 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
              <span className="text-[11px] font-semibold text-foreground">{entry.action}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {entry.toolName ? <span className="text-foreground">{entry.toolName}</span> : "—"}
              {entry.policyDecision ? ` · ${entry.policyDecision}` : ""}
              {entry.riskScore !== undefined ? ` · risk ${entry.riskScore}` : ""}
            </div>
            {entry.reason ? (
              <div className="mt-1 text-[11px] text-muted-foreground">{entry.reason}</div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CheckpointSection({
  checkpointState,
  onSessionChange,
  onRefresh,
  onRestore,
  onDelete,
}: CheckpointSectionProps) {
  return (
    <section className="card-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Checkpoints</p>
          <p className="text-xs text-muted-foreground">
            Review and restore runtime checkpoints for a session.
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
          onClick={onRefresh}
          disabled={checkpointState.isLoading}
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Checkpoint session id"
          type="text"
          className="text-input min-w-[220px]"
          placeholder="Session ID"
          value={checkpointState.sessionId}
          onChange={(event) => onSessionChange(event.target.value)}
          disabled={checkpointState.isLoading}
        />
      </div>

      {checkpointState.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full" />
          Loading checkpoints…
        </div>
      ) : null}

      {checkpointState.error ? (
        <div className="text-xs text-destructive">{checkpointState.error}</div>
      ) : null}

      {checkpointState.lastRestore ? (
        <div className="text-xs text-success">
          Restored checkpoint {checkpointState.lastRestore.checkpointId.slice(0, 8)} at{" "}
          {new Date(checkpointState.lastRestore.restoredAt).toLocaleString()}.
        </div>
      ) : null}

      {!checkpointState.isLoading && checkpointState.checkpoints.length === 0 ? (
        <div className="text-xs text-muted-foreground">No checkpoints found.</div>
      ) : null}

      <div className="space-y-2">
        {checkpointState.checkpoints.map((checkpoint) => (
          <CheckpointCard
            key={checkpoint.id}
            checkpoint={checkpoint}
            isBusy={checkpointState.isLoading}
            restoringId={checkpointState.restoringId}
            deletingId={checkpointState.deletingId}
            onRestore={onRestore}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function CheckpointCard({
  checkpoint,
  isBusy,
  restoringId,
  deletingId,
  onRestore,
  onDelete,
}: {
  checkpoint: CoworkCheckpointSummary;
  isBusy: boolean;
  restoringId?: string;
  deletingId?: string;
  onRestore: (checkpointId: string) => void;
  onDelete: (checkpointId: string) => void;
}) {
  const statusClass =
    checkpoint.status === "completed"
      ? "bg-success/10 text-success"
      : checkpoint.status === "failed"
        ? "bg-error/10 text-error"
        : checkpoint.status === "cancelled"
          ? "bg-muted/40 text-muted-foreground"
          : "bg-info/10 text-info";
  const isRestoring = restoringId === checkpoint.id;
  const isDeleting = deletingId === checkpoint.id;

  return (
    <div className="rounded-md border border-border/60 bg-surface-0 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {new Date(checkpoint.createdAt).toLocaleString()}
        </span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
          {checkpoint.status}
        </span>
      </div>
      <div className="text-xs text-foreground line-clamp-2">{checkpoint.task}</div>
      <div className="text-[11px] text-muted-foreground">
        Step {checkpoint.currentStep} / {checkpoint.maxSteps}
        {checkpoint.hasError ? " · error" : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-60"
          onClick={() => onRestore(checkpoint.id)}
          disabled={isBusy || isRestoring || isDeleting}
        >
          {isRestoring ? "Restoring…" : "Restore"}
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
          onClick={() => onDelete(checkpoint.id)}
          disabled={isBusy || isDeleting || isRestoring}
        >
          {isDeleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
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

function formatPolicySource(source: CoworkPolicySource | null): string | null {
  if (!source) {
    return null;
  }
  switch (source) {
    case "repo":
      return "Repo policy";
    case "settings":
      return "Settings policy";
    case "default":
      return "Default policy";
    case "deny_all":
      return "Deny-all fallback";
    default:
      return source;
  }
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSettingsPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const root = value as Record<string, unknown>;
  const settingsCandidate = root.settings;
  if (isRecord(settingsCandidate)) {
    return settingsCandidate;
  }
  return root;
}

function maybeDefaultModel(payload: Record<string, unknown>): Partial<CoworkSettings> {
  return typeof payload.defaultModel === "string" ? { defaultModel: payload.defaultModel } : {};
}

function maybeTheme(payload: Record<string, unknown>): Partial<CoworkSettings> {
  return payload.theme === "light" || payload.theme === "dark" ? { theme: payload.theme } : {};
}

function maybeMemoryProfile(payload: Record<string, unknown>): Partial<CoworkSettings> {
  return typeof payload.memoryProfile === "string"
    ? { memoryProfile: payload.memoryProfile as CoworkSettings["memoryProfile"] }
    : {};
}

function maybePolicy(payload: Record<string, unknown>): Partial<CoworkSettings> {
  if (!("policy" in payload)) {
    return {};
  }
  const policy = payload.policy;
  return policy === null || typeof policy === "object"
    ? { policy: policy as CoworkSettings["policy"] }
    : {};
}

function maybeCaseInsensitivePaths(payload: Record<string, unknown>): Partial<CoworkSettings> {
  return typeof payload.caseInsensitivePaths === "boolean"
    ? { caseInsensitivePaths: payload.caseInsensitivePaths }
    : {};
}

function maybeContextCompression(payload: Record<string, unknown>): Partial<CoworkSettings> {
  return payload.contextCompression && typeof payload.contextCompression === "object"
    ? { contextCompression: payload.contextCompression as CoworkSettings["contextCompression"] }
    : {};
}

function parseSettingsImport(value: unknown): Partial<CoworkSettings> | null {
  const payload = getSettingsPayload(value);
  if (!payload) {
    return null;
  }

  const patch: Partial<CoworkSettings> = {
    ...maybeDefaultModel(payload),
    ...maybeTheme(payload),
    ...maybeMemoryProfile(payload),
    ...maybePolicy(payload),
    ...maybeCaseInsensitivePaths(payload),
    ...maybeContextCompression(payload),
  };

  return Object.keys(patch).length > 0 ? patch : null;
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

function usePolicyState(settingsPolicy: CoworkSettings["policy"]) {
  const [policyState, setPolicyState] = React.useState<PolicyState>({
    policy: null,
    source: null,
    reason: null,
    draft: "",
    isDirty: false,
    isLoading: true,
    isExporting: false,
    exportPath: null,
    error: null,
    exportError: null,
  });

  const refresh = React.useCallback(async () => {
    setPolicyState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const resolved = await getPolicyResolution();
      setPolicyState((prev) => ({
        ...prev,
        policy: resolved.policy ?? null,
        source: resolved.source ?? null,
        reason: resolved.reason ?? null,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      setPolicyState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load policy",
      }));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (policyState.isDirty) {
      return;
    }
    const basePolicy = settingsPolicy ?? policyState.policy;
    if (!basePolicy) {
      setPolicyState((prev) => ({ ...prev, draft: "" }));
      return;
    }
    const nextDraft = JSON.stringify(basePolicy, null, 2);
    setPolicyState((prev) => (prev.draft === nextDraft ? prev : { ...prev, draft: nextDraft }));
  }, [settingsPolicy, policyState.policy, policyState.isDirty]);

  const setDraft = React.useCallback((value: string) => {
    setPolicyState((prev) => ({
      ...prev,
      draft: value,
      isDirty: true,
      exportPath: null,
      exportError: null,
    }));
  }, []);

  const markClean = React.useCallback(() => {
    setPolicyState((prev) => ({ ...prev, isDirty: false }));
  }, []);

  const exportPolicy = React.useCallback(async () => {
    setPolicyState((prev) => ({ ...prev, isExporting: true, exportError: null, exportPath: null }));
    try {
      const result = await exportPolicyToRepo();
      setPolicyState((prev) => ({
        ...prev,
        isExporting: false,
        exportPath: result.path,
        exportError: null,
      }));
    } catch (err) {
      setPolicyState((prev) => ({
        ...prev,
        isExporting: false,
        exportError: err instanceof Error ? err.message : "Failed to export policy",
      }));
    }
  }, []);

  return { policyState, setDraft, markClean, refresh, exportPolicy };
}

function useAuditLogState() {
  const [auditState, setAuditState] = React.useState<AuditLogState>({
    entries: [],
    sessionId: "",
    action: "all",
    isLoading: true,
    error: null,
  });

  const refresh = React.useCallback(async () => {
    setAuditState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const entries = await queryAuditLogs({
        sessionId: auditState.sessionId.trim() || undefined,
        action: auditState.action === "all" ? undefined : auditState.action,
        limit: 100,
        offset: 0,
      });
      setAuditState((prev) => ({ ...prev, entries, isLoading: false }));
    } catch (err) {
      setAuditState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load audit logs",
      }));
    }
  }, [auditState.action, auditState.sessionId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSessionId = React.useCallback((value: string) => {
    setAuditState((prev) => ({ ...prev, sessionId: value }));
  }, []);

  const updateAction = React.useCallback((value: CoworkAuditAction | "all") => {
    setAuditState((prev) => ({ ...prev, action: value }));
  }, []);

  return { auditState, refresh, updateSessionId, updateAction };
}

const DEFAULT_CHECKPOINT_FILTER: CoworkCheckpointFilter = {
  limit: 50,
  sortBy: "createdAt",
  sortOrder: "desc",
};

function useCheckpointState() {
  const [checkpointState, setCheckpointState] = React.useState<CheckpointState>({
    checkpoints: [],
    sessionId: "",
    isLoading: false,
    error: null,
    lastRestore: null,
  });

  const refresh = React.useCallback(async () => {
    const sessionId = checkpointState.sessionId.trim();
    if (!sessionId) {
      setCheckpointState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Session ID is required to list checkpoints.",
        checkpoints: [],
      }));
      return;
    }

    setCheckpointState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const checkpoints = await listCheckpoints(sessionId, DEFAULT_CHECKPOINT_FILTER);
      setCheckpointState((prev) => ({ ...prev, checkpoints, isLoading: false }));
    } catch (err) {
      setCheckpointState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load checkpoints",
      }));
    }
  }, [checkpointState.sessionId]);

  const restore = React.useCallback(
    async (checkpointId: string) => {
      const sessionId = checkpointState.sessionId.trim();
      if (!sessionId) {
        setCheckpointState((prev) => ({
          ...prev,
          error: "Session ID is required to restore checkpoints.",
        }));
        return;
      }

      setCheckpointState((prev) => ({
        ...prev,
        restoringId: checkpointId,
        error: null,
        lastRestore: null,
      }));

      try {
        const result = await restoreCheckpoint(sessionId, checkpointId);
        setCheckpointState((prev) => ({
          ...prev,
          restoringId: undefined,
          lastRestore: result,
        }));
        void refresh();
      } catch (err) {
        setCheckpointState((prev) => ({
          ...prev,
          restoringId: undefined,
          error: err instanceof Error ? err.message : "Failed to restore checkpoint",
        }));
      }
    },
    [checkpointState.sessionId, refresh]
  );

  const remove = React.useCallback(
    async (checkpointId: string) => {
      const sessionId = checkpointState.sessionId.trim();
      if (!sessionId) {
        setCheckpointState((prev) => ({
          ...prev,
          error: "Session ID is required to delete checkpoints.",
        }));
        return;
      }

      setCheckpointState((prev) => ({ ...prev, deletingId: checkpointId, error: null }));
      try {
        await deleteCheckpoint(sessionId, checkpointId);
        setCheckpointState((prev) => ({
          ...prev,
          deletingId: undefined,
          checkpoints: prev.checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
        }));
      } catch (err) {
        setCheckpointState((prev) => ({
          ...prev,
          deletingId: undefined,
          error: err instanceof Error ? err.message : "Failed to delete checkpoint",
        }));
      }
    },
    [checkpointState.sessionId]
  );

  const updateSessionId = React.useCallback((value: string) => {
    setCheckpointState((prev) => ({ ...prev, sessionId: value }));
  }, []);

  return { checkpointState, refresh, updateSessionId, restore, remove };
}

export function SettingsPage() {
  const { state, theme, handleUpdate, handleThemeChange } = useSettingsState();
  const { providerState, handleProviderInputChange, handleProviderSave, handleProviderDelete } =
    useProviderState();
  const gymState = useGymReportState();
  const { policyState, setDraft, markClean, refresh, exportPolicy } = usePolicyState(
    state.data.policy
  );
  const { auditState, refresh: refreshAudit, updateSessionId, updateAction } = useAuditLogState();
  const {
    checkpointState,
    refresh: refreshCheckpoints,
    updateSessionId: updateCheckpointSessionId,
    restore: restoreCheckpointById,
    remove: deleteCheckpointById,
  } = useCheckpointState();
  const [activeTab, setActiveTab] = React.useState<SettingsTabId>("providers");
  const [policyEditorError, setPolicyEditorError] = React.useState<string | null>(null);
  const tabs = React.useMemo(
    () =>
      config.devTools ? SETTINGS_TABS : SETTINGS_TABS.filter((tab) => tab.id !== "diagnostics"),
    []
  );

  const handlePolicySave = React.useCallback(async () => {
    setPolicyEditorError(null);
    try {
      const parsed = JSON.parse(policyState.draft) as CoworkSettings["policy"];
      await handleUpdate({ policy: parsed ?? null });
      markClean();
      void refresh();
    } catch (err) {
      setPolicyEditorError(err instanceof Error ? err.message : "Invalid policy JSON");
    }
  }, [handleUpdate, markClean, policyState.draft, refresh]);

  const handlePolicyClear = React.useCallback(async () => {
    setPolicyEditorError(null);
    await handleUpdate({ policy: null });
    markClean();
    void refresh();
  }, [handleUpdate, markClean, refresh]);

  const handleTabKeyDown = React.useCallback(
    (event: React.KeyboardEvent, index: number) => {
      let nextIndex = index;

      switch (event.key) {
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          nextIndex = (index - 1 + tabs.length) % tabs.length;
          break;
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          nextIndex = (index + 1) % tabs.length;
          break;
        case "Home":
          event.preventDefault();
          nextIndex = 0;
          break;
        case "End":
          event.preventDefault();
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      setActiveTab(tabs[nextIndex]?.id ?? "providers");
    },
    [tabs]
  );

  const handleImportSettings = React.useCallback(
    async (patch: Partial<CoworkSettings>) => {
      const { theme: importTheme, ...rest } = patch;
      if (importTheme) {
        handleThemeChange(importTheme);
      }
      if (Object.keys(rest).length > 0) {
        await handleUpdate(rest);
      }
    },
    [handleThemeChange, handleUpdate]
  );

  const tabContent = React.useMemo(() => {
    if (state.isLoading) {
      return (
        <section className="card-panel flex items-center justify-center py-12">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full" />
        </section>
      );
    }

    switch (activeTab) {
      case "providers":
        return (
          <ProvidersSection
            state={providerState}
            onInputChange={handleProviderInputChange}
            onSave={handleProviderSave}
            onDelete={handleProviderDelete}
          />
        );
      case "models":
        return (
          <>
            <ModelSection
              value={state.data.defaultModel ?? "gpt-4.1"}
              onChange={(value) => handleUpdate({ defaultModel: value })}
              disabled={state.isSaving}
            />
            <ContextCompressionSection
              value={state.data.contextCompression}
              onChange={(value) => handleUpdate({ contextCompression: value })}
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
            <LocalVectorStoreSection />
          </>
        );
      case "appearance":
        return (
          <ThemeSection theme={theme} onChange={handleThemeChange} disabled={state.isSaving} />
        );
      case "data":
        return (
          <DataSovereigntySection
            settings={state.data}
            isSaving={state.isSaving}
            onImport={handleImportSettings}
          />
        );
      case "policy":
        return (
          <PolicySection
            policyState={policyState}
            caseInsensitivePaths={state.data.caseInsensitivePaths ?? false}
            isSaving={state.isSaving}
            editorError={policyEditorError}
            onDraftChange={setDraft}
            onSave={handlePolicySave}
            onClear={handlePolicyClear}
            onExport={exportPolicy}
            onToggleCaseInsensitive={(value) => handleUpdate({ caseInsensitivePaths: value })}
          />
        );
      case "audit":
        return (
          <AuditLogSection
            auditState={auditState}
            onSessionChange={updateSessionId}
            onActionChange={updateAction}
            onRefresh={refreshAudit}
          />
        );
      case "checkpoints":
        return (
          <CheckpointSection
            checkpointState={checkpointState}
            onSessionChange={updateCheckpointSessionId}
            onRefresh={refreshCheckpoints}
            onRestore={restoreCheckpointById}
            onDelete={deleteCheckpointById}
          />
        );
      case "diagnostics":
        return <GymReportSection gymState={gymState} />;
      default:
        return null;
    }
  }, [
    activeTab,
    auditState,
    checkpointState,
    deleteCheckpointById,
    exportPolicy,
    gymState,
    handleImportSettings,
    handlePolicyClear,
    handlePolicySave,
    handleProviderDelete,
    handleProviderInputChange,
    handleProviderSave,
    handleThemeChange,
    handleUpdate,
    policyEditorError,
    policyState,
    providerState,
    refreshAudit,
    refreshCheckpoints,
    restoreCheckpointById,
    setDraft,
    state.data,
    state.isLoading,
    state.isSaving,
    theme,
    updateAction,
    updateCheckpointSessionId,
    updateSessionId,
  ]);

  return (
    <div className="h-full grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="card-panel space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Settings</p>
          <p className="text-xs text-muted-foreground">
            Configure providers, policies, and workspace preferences.
          </p>
        </div>
        <div role="tablist" aria-orientation="vertical" className="space-y-2">
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-foreground/30 bg-surface-1 text-foreground shadow-sm"
                    : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <div className="text-sm font-semibold">{tab.label}</div>
                <div className="text-xs text-muted-foreground">{tab.description}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="page-grid min-h-0"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
      >
        <SettingsErrors
          settingsError={state.error}
          saveError={state.saveError}
          providerError={providerState.error}
        />
        {tabContent}
      </div>
    </div>
  );
}
