"use client";

import { cn } from "@ku0/shared/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgentMode,
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  importWorkflowTemplates,
  listWorkflowTemplates,
  runWorkflowTemplate,
  updateWorkflowTemplate,
  type WorkflowTemplate,
  type WorkflowTemplateInput,
} from "../../api/coworkApi";

type InputDraft = WorkflowTemplateInput & { id: string };

const DEFAULT_TEMPLATE_VERSION = "1.0.0";

const emptyDraft = (): WorkflowTemplate => ({
  templateId: "",
  name: "",
  description: "",
  mode: "build",
  inputs: [],
  prompt: "",
  expectedArtifacts: [],
  version: DEFAULT_TEMPLATE_VERSION,
  createdAt: 0,
  updatedAt: 0,
});

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "Never";
  }
  return new Date(timestamp).toLocaleString();
}

function toInputDrafts(inputs: WorkflowTemplateInput[]): InputDraft[] {
  return inputs.map((input) => ({ ...input, id: crypto.randomUUID() }));
}

function parseExpectedArtifacts(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// biome-ignore lint:complexity/noExcessiveCognitiveComplexity
export function WorkflowTemplatesPanel({
  onClose,
  onRunTemplate,
}: {
  onClose: () => void;
  onRunTemplate: (prompt: string, mode: AgentMode) => Promise<void>;
}) {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const resolvedSessionId = sessionId && sessionId !== "undefined" ? sessionId : undefined;

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<WorkflowTemplate>(emptyDraft());
  const [draftInputs, setDraftInputs] = useState<InputDraft[]>([]);
  const [expectedArtifactsText, setExpectedArtifactsText] = useState("");
  const [importPayload, setImportPayload] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.templateId === selectedId) ?? null,
    [templates, selectedId]
  );

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => b.updatedAt - a.updatedAt),
    [templates]
  );

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await listWorkflowTemplates();
      setTemplates(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0]?.templateId ?? null);
      }
    } catch (error) {
      setErrorMessage("Failed to load workflow templates.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to load workflow templates", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (selectedTemplate?.lastUsedInputs) {
      setInputValues(selectedTemplate.lastUsedInputs);
    } else {
      setInputValues({});
    }
  }, [selectedTemplate]);

  const resetDraft = useCallback(() => {
    setDraft(emptyDraft());
    setDraftInputs([]);
    setExpectedArtifactsText("");
  }, []);

  const handleEditTemplate = useCallback((template: WorkflowTemplate) => {
    setDraft(template);
    setDraftInputs(toInputDrafts(template.inputs));
    setExpectedArtifactsText(template.expectedArtifacts.join(", "));
  }, []);

  const handleAddInput = useCallback(() => {
    setDraftInputs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        key: "",
        label: "",
        required: false,
        placeholder: "",
      },
    ]);
  }, []);

  const handleUpdateInput = useCallback((id: string, next: Partial<InputDraft>) => {
    setDraftInputs((prev) =>
      prev.map((input) => (input.id === id ? { ...input, ...next } : input))
    );
  }, []);

  const handleRemoveInput = useCallback((id: string) => {
    setDraftInputs((prev) => prev.filter((input) => input.id !== id));
  }, []);

  const buildInputsPayload = useCallback((): WorkflowTemplateInput[] => {
    return draftInputs
      .map((input) => ({
        key: input.key.trim(),
        label: input.label.trim() || input.key.trim(),
        required: input.required,
        placeholder: input.placeholder?.trim() || undefined,
      }))
      .filter((input) => input.key.length > 0);
  }, [draftInputs]);

  const handleSaveTemplate = useCallback(async () => {
    if (!draft.name.trim()) {
      setErrorMessage("Template name is required.");
      return;
    }
    if (!draft.prompt.trim()) {
      setErrorMessage("Template prompt is required.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        mode: draft.mode,
        inputs: buildInputsPayload(),
        prompt: draft.prompt.trim(),
        expectedArtifacts: parseExpectedArtifacts(expectedArtifactsText),
        version: draft.version.trim() || DEFAULT_TEMPLATE_VERSION,
      };
      if (draft.templateId) {
        const updated = await updateWorkflowTemplate(draft.templateId, payload);
        setTemplates((prev) =>
          prev.map((template) => (template.templateId === updated.templateId ? updated : template))
        );
        setSelectedId(updated.templateId);
        setSuccessMessage("Template updated.");
      } else {
        const created = await createWorkflowTemplate(payload);
        setTemplates((prev) => [created, ...prev]);
        setSelectedId(created.templateId);
        setSuccessMessage("Template created.");
      }
      resetDraft();
    } catch (error) {
      setErrorMessage("Failed to save workflow template.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to save workflow template", error);
    } finally {
      setIsSaving(false);
    }
  }, [buildInputsPayload, draft, expectedArtifactsText, resetDraft]);

  const handleDeleteTemplate = useCallback(
    async (templateId: string) => {
      setIsSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        await deleteWorkflowTemplate(templateId);
        setTemplates((prev) => prev.filter((template) => template.templateId !== templateId));
        if (selectedId === templateId) {
          setSelectedId(null);
        }
      } catch (error) {
        setErrorMessage("Failed to delete workflow template.");
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to delete workflow template", error);
      } finally {
        setIsSaving(false);
      }
    },
    [selectedId]
  );

  const handleRunTemplate = useCallback(async () => {
    if (!selectedTemplate) {
      return;
    }
    setIsRunning(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await runWorkflowTemplate(selectedTemplate.templateId, {
        inputs: inputValues,
        sessionId: resolvedSessionId,
      });
      setTemplates((prev) =>
        prev.map((template) =>
          template.templateId === result.template.templateId ? result.template : template
        )
      );
      await onRunTemplate(result.prompt, selectedTemplate.mode);
      setSuccessMessage("Template launched.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run template.";
      setErrorMessage(message);
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to run workflow template", error);
    } finally {
      setIsRunning(false);
    }
  }, [inputValues, onRunTemplate, resolvedSessionId, selectedTemplate]);

  const handleExport = useCallback(async (template: WorkflowTemplate) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
      setSuccessMessage("Template copied to clipboard.");
    } catch (error) {
      setErrorMessage("Failed to copy template.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to copy workflow template", error);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importPayload.trim()) {
      setErrorMessage("Paste JSON to import.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const parsed = JSON.parse(importPayload) as
        | WorkflowTemplate
        | WorkflowTemplate[]
        | {
            templates: WorkflowTemplate[];
          };
      const templates = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { templates?: WorkflowTemplate[] }).templates)
          ? (parsed as { templates: WorkflowTemplate[] }).templates
          : [parsed as WorkflowTemplate];
      const imported = await importWorkflowTemplates(templates);
      setTemplates((prev) => [...imported, ...prev]);
      setImportPayload("");
      setSuccessMessage("Templates imported.");
    } catch (error) {
      setErrorMessage("Failed to import templates.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to import workflow templates", error);
    } finally {
      setIsSaving(false);
    }
  }, [importPayload]);

  return (
    <div className="flex flex-col h-full bg-surface-0 border-l border-border shadow-xl w-[720px] animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-50/50 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Workflow Templates</h2>
          <p className="text-xs text-muted-foreground">
            Create repeatable workflows with parameterized prompts.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-surface-100 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close workflow templates"
        >
          X
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-md">
            {successMessage}
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Template Editor</h3>
              <p className="text-xs text-muted-foreground">
                Use {"{{inputKey}}"} placeholders inside the prompt.
              </p>
            </div>
            <button
              type="button"
              onClick={resetDraft}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>

          <div className="grid gap-3">
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Template name"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Template name"
            />
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Template description"
              rows={2}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Template description"
            />
            <div className="flex flex-wrap gap-2">
              {(["plan", "build"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, mode }))}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors",
                    draft.mode === mode
                      ? "bg-foreground text-background border-foreground"
                      : "text-foreground border-border hover:bg-surface-100"
                  )}
                  aria-pressed={draft.mode === mode}
                >
                  {mode.toUpperCase()} Mode
                </button>
              ))}
            </div>
            <textarea
              value={draft.prompt}
              onChange={(event) => setDraft((prev) => ({ ...prev, prompt: event.target.value }))}
              placeholder="Template prompt..."
              rows={6}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Template prompt"
            />
            <input
              type="text"
              value={expectedArtifactsText}
              onChange={(event) => setExpectedArtifactsText(event.target.value)}
              placeholder="Expected artifacts (comma separated)"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Expected artifacts"
            />
            <input
              type="text"
              value={draft.version}
              onChange={(event) => setDraft((prev) => ({ ...prev, version: event.target.value }))}
              placeholder="Version"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Template version"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Inputs</p>
              <button
                type="button"
                onClick={handleAddInput}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Add input
              </button>
            </div>
            <div className="space-y-2">
              {draftInputs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No inputs defined.</p>
              ) : null}
              {draftInputs.map((input) => (
                <div key={input.id} className="grid gap-2 md:grid-cols-[140px_140px_1fr_80px]">
                  <input
                    type="text"
                    value={input.key}
                    onChange={(event) => handleUpdateInput(input.id, { key: event.target.value })}
                    placeholder="Key"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label="Input key"
                  />
                  <input
                    type="text"
                    value={input.label}
                    onChange={(event) => handleUpdateInput(input.id, { label: event.target.value })}
                    placeholder="Label"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label="Input label"
                  />
                  <input
                    type="text"
                    value={input.placeholder ?? ""}
                    onChange={(event) =>
                      handleUpdateInput(input.id, { placeholder: event.target.value })
                    }
                    placeholder="Placeholder"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label="Input placeholder"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={input.required}
                        onChange={(event) =>
                          handleUpdateInput(input.id, { required: event.target.checked })
                        }
                        aria-label="Required input"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveInput(input.id)}
                      className="text-[11px] text-destructive hover:text-destructive/80"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isSaving}
              className={cn(
                "px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm",
                isSaving ? "opacity-70 cursor-wait" : ""
              )}
            >
              {draft.templateId ? "Update Template" : "Create Template"}
            </button>
            <button
              type="button"
              onClick={resetDraft}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Templates</h3>
              <p className="text-xs text-muted-foreground">
                Select a template to run it in the current session.
              </p>
            </div>
            {isLoading ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
          </div>

          {sortedTemplates.length === 0 && !isLoading ? (
            <div className="text-xs text-muted-foreground border border-border/40 rounded-md p-3 bg-surface-50">
              No templates yet. Create one above.
            </div>
          ) : null}

          {sortedTemplates.map((template) => {
            const isSelected = template.templateId === selectedId;
            return (
              <div
                key={template.templateId}
                className={cn(
                  "rounded-lg border border-border/40 bg-surface-50/70 p-3 space-y-2",
                  isSelected ? "ring-1 ring-primary/40" : ""
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedId(template.templateId)}
                      className="text-sm font-semibold text-foreground hover:underline text-left"
                    >
                      {template.name}
                    </button>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {template.mode.toUpperCase()} | v{template.version} | Used{" "}
                      {template.usageCount ?? 0} times | Last run{" "}
                      {formatTimestamp(template.lastUsedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(template)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport(template)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(template.templateId)}
                      disabled={isSaving}
                      className="text-xs text-destructive hover:text-destructive/80"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Run Template</h3>
            <p className="text-xs text-muted-foreground">
              Fill required inputs, then launch a task.
            </p>
          </div>

          {!selectedTemplate ? (
            <div className="text-xs text-muted-foreground border border-border/40 rounded-md p-3 bg-surface-50">
              Select a template to run.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedTemplate.inputs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No inputs required.</p>
              ) : (
                selectedTemplate.inputs.map((input) => (
                  <div key={input.key} className="space-y-1">
                    <label className="text-xs font-semibold text-foreground" htmlFor={input.key}>
                      {input.label}
                      {input.required ? " *" : ""}
                    </label>
                    <input
                      id={input.key}
                      type="text"
                      value={inputValues[input.key] ?? ""}
                      onChange={(event) =>
                        setInputValues((prev) => ({ ...prev, [input.key]: event.target.value }))
                      }
                      placeholder={input.placeholder}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label={input.label}
                    />
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={handleRunTemplate}
                disabled={isRunning || !selectedTemplate}
                className={cn(
                  "px-4 py-2 text-sm font-medium text-white bg-foreground rounded-md hover:bg-foreground/90 transition-colors shadow-sm",
                  isRunning ? "opacity-70 cursor-wait" : ""
                )}
              >
                {isRunning ? "Launching..." : "Run Template"}
              </button>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Import Templates</h3>
            <p className="text-xs text-muted-foreground">Paste JSON (single template or array).</p>
          </div>
          <textarea
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            placeholder='[{"name":"..."}]'
            aria-label="Import workflow templates"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={isSaving}
            className={cn(
              "px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors",
              isSaving ? "opacity-70 cursor-wait" : ""
            )}
          >
            Import Templates
          </button>
        </section>
      </div>
    </div>
  );
}
