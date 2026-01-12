"use client";

import { cn } from "@keepup/shared/utils";
import { AlertCircle, CheckCircle, Link2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

interface AddFeedFormProps {
  onSubmit: (url: string, title?: string) => void;
  onCancel: () => void;
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

export function AddFeedForm({ onSubmit, onCancel }: AddFeedFormProps) {
  const t = useTranslations("Feeds");
  const [url, setUrl] = useState("");
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [feedTitle, setFeedTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateUrl = useCallback(
    async (inputUrl: string) => {
      if (!inputUrl.trim()) {
        setValidationState("idle");
        setFeedTitle(null);
        setError(null);
        return;
      }

      // Basic URL validation
      try {
        const parsed = new URL(inputUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          setValidationState("invalid");
          setError(t("invalidProtocol"));
          return;
        }
      } catch {
        setValidationState("invalid");
        setError(t("invalidUrl"));
        return;
      }

      setValidationState("validating");
      setError(null);

      try {
        // Try to fetch feed metadata via API
        const response = await fetch(`/api/rss/validate?url=${encodeURIComponent(inputUrl)}`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to validate feed");
        }

        const data = await response.json();
        setFeedTitle(data.title || null);
        setValidationState("valid");
      } catch {
        // If API fails, still allow adding (validation is optional)
        setValidationState("valid");
        setFeedTitle(null);
      }
    },
    [t]
  );

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);

    // Debounced validation would be better, but for simplicity:
    if (newUrl.includes("://")) {
      validateUrl(newUrl);
    } else {
      setValidationState("idle");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationState === "valid" || validationState === "idle") {
      onSubmit(url.trim(), feedTitle || undefined);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="feed-url" className="block text-sm font-medium mb-1.5">
          {t("feedUrl")}
        </label>
        <div className="relative">
          <input
            id="feed-url"
            type="text"
            value={url}
            onChange={handleUrlChange}
            placeholder="https://example.com/feed.xml"
            className={cn(
              "w-full pl-10 pr-10 py-2.5 rounded-lg border bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              validationState === "invalid" ? "border-red-500" : "border-input"
            )}
          />
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {validationState === "validating" && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {validationState === "valid" && <CheckCircle className="w-4 h-4 text-green-500" />}
            {validationState === "invalid" && <AlertCircle className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        {feedTitle && (
          <p className="text-green-600 text-sm mt-1">
            {t("feedDetected")}: {feedTitle}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg hover:bg-muted font-medium"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={
            validationState === "validating" || validationState === "invalid" || !url.trim()
          }
          className={cn(
            "px-4 py-2 rounded-lg font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {t("addFeed")}
        </button>
      </div>
    </form>
  );
}
