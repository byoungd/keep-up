"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { isValidHttpUrl } from "@/hooks/useGlobalDropTarget";
import { useImportManager } from "@/hooks/useImportManager";
import { registerFile } from "@/lib/db";
import { importFeatureFlags } from "@/lib/import/importFeatures";
import { trackImportStarted, trackModalOpened } from "@/lib/import/telemetry";
import { cn } from "@keepup/shared/utils";
import { AlertCircle, Globe, Upload, Youtube } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

interface AddContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: string;
}

type ImportTab = "paste" | "url" | "file";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

function deriveTitleFromContent(content: string): string | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const heading = lines.find((line) => line.startsWith("#"));
  if (heading) {
    return heading.replace(/^#+\s*/, "").trim();
  }

  return lines[0].slice(0, 80);
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || "pasted";
}

function buildFileContents(content: string, title: string): string {
  if (FRONTMATTER_RE.test(content)) {
    return content;
  }

  return `---\ntitle: ${title}\n---\n${content}`;
}

function resolveUrlSourceType(value: string): "url" | "rss" | "youtube" {
  const lower = value.toLowerCase();
  if (importFeatureFlags.youtube && (lower.includes("youtube.com") || lower.includes("youtu.be"))) {
    return "youtube";
  }
  if (importFeatureFlags.rss && (lower.endsWith(".xml") || lower.includes("rss"))) {
    return "rss";
  }
  return "url";
}

export function AddContentDialog({ open, onOpenChange, initialValue = "" }: AddContentDialogProps) {
  const t = useTranslations("Import");
  const { toast } = useToast();
  const manager = useImportManager();
  const [activeTab, setActiveTab] = React.useState<ImportTab>("paste");
  const [urlValue, setUrlValue] = React.useState(initialValue);
  const [titleValue, setTitleValue] = React.useState("");
  const [contentValue, setContentValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const trimmedUrl = urlValue.trim();
  const urlValidity = trimmedUrl.length > 0 ? isValidHttpUrl(trimmedUrl) : null;
  const urlImportEnabled = importFeatureFlags.url;
  const urlImportUnavailable = !urlImportEnabled;

  React.useEffect(() => {
    if (open) {
      const hasUrl = initialValue && isValidHttpUrl(initialValue);
      const nextTab = hasUrl ? "url" : "paste";
      setActiveTab(nextTab);
      setUrlValue(initialValue);
      setTitleValue("");
      setContentValue("");
      setError(null);
      setIsSubmitting(false);
      trackModalOpened(nextTab);
    }
  }, [open, initialValue]);

  // Clear error when tab changes - activeTab triggers this intentionally
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab used to trigger error reset on tab change
  React.useEffect(() => {
    setError(null);
  }, [activeTab]);

  const handlePasteImport = async () => {
    const trimmedContent = contentValue.trim();
    if (!trimmedContent) {
      setError("Paste some content to import.");
      return;
    }
    if (!manager) {
      setError(t("managerNotReady"));
      toast(t("managerNotReady"), "error");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const derivedTitle =
        titleValue.trim() || deriveTitleFromContent(trimmedContent) || "Untitled";
      const fileName = `${slugifyTitle(derivedTitle)}-${Date.now()}.md`;
      const fileContents = buildFileContents(trimmedContent, derivedTitle);
      const file = new File([fileContents], fileName, { type: "text/markdown" });
      const ref = await registerFile(file);
      const jobId = await manager.enqueue({ sourceType: "file", sourceRef: ref });
      trackImportStarted("file", jobId);
      onOpenChange(false);
      setTitleValue("");
      setContentValue("");
      setUrlValue("");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("importFailed");
      setError(message);
      toast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUrlImport = async () => {
    const trimmedUrl = urlValue.trim();
    if (urlImportUnavailable) {
      setError(t("urlImportUnsupported"));
      return;
    }
    if (!trimmedUrl) {
      setError("Enter a URL to import.");
      return;
    }
    if (!isValidHttpUrl(trimmedUrl)) {
      setError(t("invalidUrl"));
      return;
    }
    if (!manager) {
      setError(t("managerNotReady"));
      toast(t("managerNotReady"), "error");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const sourceType = resolveUrlSourceType(trimmedUrl);
      const jobId = await manager.enqueue({ sourceType, sourceRef: trimmedUrl });
      trackImportStarted(sourceType, jobId);
      onOpenChange(false);
      setUrlValue("");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("importFailed");
      setError(message);
      toast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleUrlImport();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!manager) {
      setError(t("managerNotReady"));
      toast(t("managerNotReady"), "error");
      return;
    }
    if (!e.target.files?.length) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      for (const file of Array.from(e.target.files)) {
        const ref = await registerFile(file);
        const jobId = await manager.enqueue({ sourceType: "file", sourceRef: ref });
        trackImportStarted("file", jobId);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("importFailed");
      setError(message);
      toast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!manager) {
      setError(t("managerNotReady"));
      toast(t("managerNotReady"), "error");
      return;
    }
    if (!e.dataTransfer.files?.length) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      for (const file of Array.from(e.dataTransfer.files)) {
        const ref = await registerFile(file);
        const jobId = await manager.enqueue({ sourceType: "file", sourceRef: ref });
        trackImportStarted("file", jobId);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("importFailed");
      setError(message);
      toast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add Content" size="lg">
      <div className="flex flex-col gap-6 py-2">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ImportTab)}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="paste">Paste</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="file">File</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="paste-title" className="text-sm font-medium text-foreground">
                Title (optional)
              </label>
              <Input
                id="paste-title"
                placeholder="Add a title to help organize this document"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="paste-content" className="text-sm font-medium text-foreground">
                Paste content
              </label>
              <textarea
                id="paste-content"
                className={cn(
                  "min-h-[180px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary/50",
                  "placeholder:text-muted-foreground"
                )}
                placeholder="Paste markdown or plain text here..."
                value={contentValue}
                onChange={(e) => setContentValue(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={handlePasteImport}
                disabled={isSubmitting || contentValue.trim().length === 0}
              >
                {isSubmitting ? t("importing") : t("import")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="url-input" className="text-sm font-medium text-foreground">
                URL to import
              </label>
              <Input
                id="url-input"
                leftIcon={<Globe className="h-4 w-4" />}
                placeholder="https://example.com/article"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={handleUrlKeyDown}
                error={urlValidity === false}
              />
              {urlValidity === false && (
                <p className="text-xs text-destructive">{t("invalidUrl")}</p>
              )}
              {urlImportUnavailable && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                  <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
                  <span>{t("urlImportUnsupported")}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleUrlImport}
                disabled={isSubmitting || urlValidity !== true || urlImportUnavailable}
              >
                {isSubmitting ? t("importing") : t("import")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="file" className="space-y-4">
            <div
              className={cn(
                "relative border-2 border-dashed border-border rounded-xl p-8 transition-all",
                "flex flex-col items-center justify-center gap-4 text-center",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "hover:bg-surface-2/50 hover:border-primary/20"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="text-muted-foreground">
                <p className="text-sm font-medium">Drag & drop files here</p>
                <p className="text-xs opacity-60 mt-1">Markdown, Text, HTML</p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept=".md,.markdown,.txt,.html"
                onChange={handleFileSelect}
                disabled={isSubmitting}
              />

              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 h-9 rounded-full px-4 bg-surface-3 hover:bg-surface-4 border border-white/5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                >
                  <Upload className="h-4 w-4" />
                  Upload files
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 h-9 rounded-full px-4 text-muted-foreground hover:text-foreground"
                  onClick={() => setActiveTab("url")}
                >
                  <Globe className="h-4 w-4" />
                  Website
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 h-9 rounded-full px-4 text-muted-foreground hover:text-foreground"
                  onClick={() => setActiveTab("url")}
                >
                  <Youtube className="h-4 w-4" />
                  YouTube
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Dialog>
  );
}
