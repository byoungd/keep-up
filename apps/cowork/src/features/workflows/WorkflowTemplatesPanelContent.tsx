"use client";

import { cn } from "@ku0/shared/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgentMode,
  listWorkflowTemplates,
  runWorkflowTemplate,
  type WorkflowTemplate,
} from "../../api/coworkApi";

/**
 * Content-only version of WorkflowTemplatesPanel for embedding in ContextPanel tabs.
 * Simplified to list templates and run them.
 */
export function WorkflowTemplatesPanelContent({
  onRunTemplate,
}: {
  onRunTemplate?: (
    prompt: string,
    mode: AgentMode,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
}) {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const resolvedSessionId = sessionId && sessionId !== "undefined" ? sessionId : undefined;

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
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
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0]?.templateId ?? null);
      }
    } catch {
      setErrorMessage("Failed to load workflow templates.");
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

  const handleRunTemplate = useCallback(async () => {
    if (!selectedTemplate || !onRunTemplate) {
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
      await onRunTemplate(result.prompt, result.template.mode, {
        workflowTemplate: {
          templateId: result.template.templateId,
          name: result.template.name,
          version: result.template.version,
          mode: result.template.mode,
        },
      });
      setSuccessMessage("Template launched.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run template.";
      setErrorMessage(message);
    } finally {
      setIsRunning(false);
    }
  }, [inputValues, onRunTemplate, resolvedSessionId, selectedTemplate]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-4 space-y-4">
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="text-xs text-success bg-success/10 border border-success/20 px-3 py-2 rounded-md">
            {successMessage}
          </div>
        ) : null}

        {/* Template List */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Workflow Templates</h3>
            {isLoading && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>

          {sortedTemplates.length === 0 && !isLoading ? (
            <p className="text-xs text-muted-foreground">No templates yet.</p>
          ) : null}

          <div className="space-y-2">
            {sortedTemplates.map((template) => (
              <button
                key={template.templateId}
                type="button"
                onClick={() => setSelectedId(template.templateId)}
                className={cn(
                  "w-full text-left rounded-lg border border-border/40 bg-surface-1/70 p-2 space-y-0.5 transition-colors",
                  selectedId === template.templateId
                    ? "ring-1 ring-primary/40 bg-surface-2/50"
                    : "hover:bg-surface-2/30"
                )}
              >
                <p className="text-xs font-semibold text-foreground">{template.name}</p>
                {template.description && (
                  <p className="text-micro text-muted-foreground line-clamp-1">
                    {template.description}
                  </p>
                )}
                <p className="text-micro text-muted-foreground">
                  {template.mode} · v{template.version}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Run Selected Template */}
        {selectedTemplate && (
          <section className="space-y-3 border-t border-border/40 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{selectedTemplate.name}</p>
              <button
                type="button"
                onClick={handleRunTemplate}
                disabled={isRunning || !onRunTemplate}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors",
                  isRunning ? "opacity-70 cursor-wait" : ""
                )}
              >
                {isRunning ? "Running..." : "Run"}
              </button>
            </div>

            {selectedTemplate.inputs.length > 0 && (
              <div className="space-y-2">
                {selectedTemplate.inputs.map((input) => (
                  <div key={input.key} className="space-y-1">
                    <label
                      htmlFor={`input-${input.key}`}
                      className="text-xs font-medium text-foreground"
                    >
                      {input.label}
                      {input.required && <span className="text-destructive ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={inputValues[input.key] || ""}
                      onChange={(e) =>
                        setInputValues((prev) => ({ ...prev, [input.key]: e.target.value }))
                      }
                      id={`input-${input.key}`}
                      placeholder={input.placeholder}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
