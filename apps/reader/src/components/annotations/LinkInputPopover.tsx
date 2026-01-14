"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@ku0/shared/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Link as LinkIcon, X } from "lucide-react";
import * as React from "react";

interface LinkInputPopoverProps {
  isOpen: boolean;
  x: number;
  y: number;
  currentUrl?: string;
  onApply: (url: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
}

const URL_PATTERN = /^(https?:\/\/|mailto:)/i;

function isValidUrl(url: string): boolean {
  return URL_PATTERN.test(url.trim());
}

/**
 * Product-grade link input popover to replace window.prompt.
 * Accessible, supports keyboard navigation (Enter = apply, Esc = cancel).
 */
export function LinkInputPopover({
  isOpen,
  x,
  y,
  currentUrl = "",
  onApply,
  onCancel,
  onRemove,
}: LinkInputPopoverProps) {
  const [url, setUrl] = React.useState(currentUrl);
  const [error, setError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset state when popover opens
  React.useEffect(() => {
    if (isOpen) {
      setUrl(currentUrl);
      setError(false);
      // Focus the input with a slight delay for animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, currentUrl]);

  const handleApply = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    if (!isValidUrl(trimmed)) {
      setError(true);
      return;
    }
    onApply(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) {
      setError(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            "fixed z-50 flex flex-col gap-2 p-3 rounded-lg",
            "border backdrop-blur-xl shadow-lg",
            "bg-white/80 border-zinc-200/60 dark:bg-zinc-900/80 dark:border-zinc-700/50",
            "shadow-zinc-900/5 dark:shadow-black/20",
            "w-72"
          )}
          style={{
            top: y,
            left: x,
            transform: "translate(-50%, 8px)",
          }}
          // biome-ignore lint/a11y/useSemanticElements: motion.div cannot be replaced with native dialog
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-popover-title"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span id="link-popover-title">Insert Link</span>
          </div>

          <Input
            ref={inputRef}
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            error={error}
            className="text-sm"
            aria-label="URL"
            aria-invalid={error}
          />

          {error && (
            <p className="text-destructive text-xs">
              Please enter a valid URL (http, https, or mailto)
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              {currentUrl && (
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Open link"
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  <span className="sr-only">Open link in new tab</span>
                </a>
              )}
              {onRemove && currentUrl && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-1"
                  title="Remove link"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                  <span className="sr-only">Remove link</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="compact" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="primary" size="compact" onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
