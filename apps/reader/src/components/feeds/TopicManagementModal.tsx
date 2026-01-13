/**
 * TopicManagementModal - Create or Edit a Topic
 */

"use client";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/utils";
import { useFeedProvider } from "@/providers/FeedProvider";
import type { TopicRow } from "@keepup/db";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import * as React from "react";

interface TopicManagementModalProps {
  open: boolean;
  onClose: () => void;
  topic?: TopicRow; // If provided, we are in Edit mode
}

const COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Yellow", value: "#eab308" },
  { label: "Lime", value: "#84cc16" },
  { label: "Green", value: "#22c55e" },
  { label: "Emerald", value: "#10b981" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Sky", value: "#0ea5e9" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Fuchsia", value: "#d946ef" },
  { label: "Pink", value: "#ec4899" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Slate", value: "#64748b" },
];

export function TopicManagementModal({ open, onClose, topic }: TopicManagementModalProps) {
  const isEditing = !!topic;
  const [name, setName] = React.useState(topic?.name ?? "");
  const [color, setColor] = React.useState(topic?.color ?? COLORS[10].value); // Default Blue
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { createTopic, updateTopic } = useFeedProvider();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset state when opening/switching modes
  React.useEffect(() => {
    if (open) {
      setName(topic?.name ?? "");
      setColor(topic?.color ?? COLORS[10].value);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, topic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a name");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && topic) {
        await updateTopic(topic.topicId, { name: trimmedName, color });
      } else {
        await createTopic(trimmedName, color);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save topic");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title={isEditing ? "Edit Topic" : "New Topic"}
      description={
        isEditing ? "Update your topic details." : "Create a new topic to organize your feeds."
      }
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="topic-name">Name</Label>
          <Input
            ref={inputRef}
            id="topic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Technology"
            autoComplete="off"
            className={cn(error && "border-red-500/50")}
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Color
          </span>
          <div className="grid grid-cols-6 gap-2">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={cn(
                  "h-6 w-6 rounded-full border border-border/10 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-ring flex items-center justify-center",
                  color === c.value
                    ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                    : ""
                )}
                style={{ backgroundColor: c.value }}
                title={c.label}
                aria-label={`Select color ${c.label}`}
                aria-pressed={color === c.value}
              >
                {color === c.value && <Check className="h-3.5 w-3.5 text-white drop-shadow-md" />}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 p-2 rounded-md">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Saving...
              </>
            ) : (
              "Save Topic"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
