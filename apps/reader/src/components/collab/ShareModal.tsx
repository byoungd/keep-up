/**
 * ShareModal - Document sharing dialog
 *
 * Allows users to generate shareable links with role selection.
 */

"use client";

import { cn } from "@/lib/utils";
import { Check, Copy, Edit3, Eye, Link2, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/Button";
import { useInviteToken } from "@/hooks/useInviteToken";

interface ShareModalProps {
  /** Document ID to share */
  docId: string;
  /** Whether modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

type ShareRole = "editor" | "viewer";

/**
 * Modal for generating shareable document links.
 */
export function ShareModal({
  docId,
  isOpen,
  onClose,
  className,
}: ShareModalProps): React.ReactElement | null {
  const [role, setRole] = React.useState<ShareRole>("viewer");
  const [copied, setCopied] = React.useState(false);
  const { generateInviteUrl } = useInviteToken();

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  // Handle copy to clipboard
  const handleCopy = React.useCallback(async () => {
    const url = generateInviteUrl(docId, role);

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [docId, role, generateInviteUrl]);

  // Handle escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <dialog
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      open
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal content */}
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-border bg-surface-1 p-6 shadow-xl",
          className
        )}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="share-modal-title" className="text-lg font-semibold">
              Share document
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Role selection */}
        <div className="mb-6">
          <span className="mb-2 block text-sm font-medium text-foreground">Access level</span>
          <div className="flex gap-2">
            <RoleButton
              roleType="editor"
              selected={role === "editor"}
              onClick={() => setRole("editor")}
              icon={Edit3}
              label="Editor"
              description="Can edit document"
            />
            <RoleButton
              roleType="viewer"
              selected={role === "viewer"}
              onClick={() => setRole("viewer")}
              icon={Eye}
              label="Viewer"
              description="Can only view"
            />
          </div>
        </div>

        {/* Copy link button */}
        <Button type="button" variant="primary" className="w-full" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Link copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              Copy link
            </>
          )}
        </Button>

        {/* Info text */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Anyone with this link can {role === "editor" ? "edit" : "view"} this document
        </p>
      </div>
    </dialog>
  );
}

/**
 * Role selection button.
 */
function RoleButton({
  roleType,
  selected,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  roleType: ShareRole;
  selected: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-lg border p-4 transition-colors",
        selected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border bg-surface-2 text-muted-foreground hover:border-primary/50 hover:bg-surface-1"
      )}
      aria-pressed={selected}
      data-role={roleType}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs opacity-70">{description}</span>
    </button>
  );
}

/**
 * Share button trigger for the modal.
 */
export function ShareButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}): React.ReactElement {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className={className}>
      <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      Share
    </Button>
  );
}
