import { cn } from "@ku0/shared/utils";
import { useCallback, useEffect, useState } from "react";
import { generateContext, getProjectContext, saveContext } from "../../api/coworkApi";

export function ProjectContextPanel({ onClose }: { onClose: () => void }) {
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
      // First analyze (optional if generate does it, but let's be explicit or just call generate)
      // generateContext calls analyze internally if needed or we can pass options
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
    <div className="flex flex-col h-full bg-surface-0 border-l border-border shadow-xl w-[600px] animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-1/50 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Project Context (AGENTS.md)</h2>
          <p className="text-xs text-muted-foreground">
            {lastUpdated
              ? `Last updated: ${new Date(lastUpdated).toLocaleString()}`
              : "No context generated yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-surface-2 rounded-md text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-0/50 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : null}

        <textarea
          className={cn(
            "w-full h-full p-6 bg-surface-0 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20",
            mode === "view" ? "readonly" : ""
          )}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          readOnly={mode === "view"}
          placeholder="# Project Context\n\nNo context generated yet. Click 'Regenerate' to analyze project."
        />
      </div>

      <div className="px-6 py-4 border-t border-border bg-surface-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {mode === "view" ? (
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface-1 border border-border rounded-md hover:bg-surface-2 transition-colors duration-fast"
            >
              Edit Manually
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast shadow-sm disabled:opacity-50"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  loadContext(); // Revert
                }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-fast"
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
            "px-4 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/15 transition-colors duration-fast shadow-sm flex items-center gap-2",
            isGenerating ? "opacity-70 cursor-wait" : ""
          )}
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Regenerate Icon</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Regenerate
            </>
          )}
        </button>
      </div>
    </div>
  );
}
