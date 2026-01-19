import { cn } from "@ku0/shared/utils";
import { useCallback, useEffect, useState } from "react";
import { generateContext, getProjectContext, saveContext } from "../../api/coworkApi";

/**
 * Content-only version of ProjectContextPanel for embedding in ContextPanel tabs.
 * No header/close button - just the content.
 */
export function ProjectContextPanelContent() {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | undefined>();
  const [mode, setMode] = useState<"view" | "edit">("view");

  const loadContext = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getProjectContext();
      setContent(data.content || "");
      setLastUpdated(data.updatedAt);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to load context", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const newContent = await generateContext();
      setContent(newContent);
      setMode("view");
      setLastUpdated(Date.now());
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to generate context", error);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    setIsLoading(true);
    try {
      await saveContext(content);
      setMode("view");
      setLastUpdated(Date.now());
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to save context", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Info bar */}
      <div className="shrink-0 px-4 py-2 border-b border-border/20 bg-surface-1/50">
        <p className="text-sm font-semibold text-foreground">Project Context (AGENTS.md)</p>
        <p className="text-xs text-muted-foreground">
          {lastUpdated
            ? `Last updated: ${new Date(lastUpdated).toLocaleString()}`
            : "No context generated yet"}
        </p>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-0/50 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : null}

        <textarea
          className={cn(
            "w-full h-full p-4 bg-surface-0 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20",
            mode === "view" ? "readonly" : ""
          )}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          readOnly={mode === "view"}
          placeholder="# Project Context

No context generated yet. Click 'Regenerate' to analyze project."
        />
      </div>

      {/* Action bar */}
      <div className="shrink-0 px-4 py-3 border-t border-border/20 bg-surface-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {mode === "view" ? (
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="px-3 py-1.5 text-xs font-medium text-foreground bg-surface-1 border border-border rounded-md hover:bg-surface-2 transition-colors duration-fast"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  loadContext();
                }}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-fast"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || mode === "edit"}
          className={cn(
            "px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/15 transition-colors duration-fast flex items-center gap-1.5",
            isGenerating ? "opacity-70 cursor-wait" : ""
          )}
        >
          {isGenerating ? (
            <>
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            "Regenerate"
          )}
        </button>
      </div>
    </div>
  );
}
