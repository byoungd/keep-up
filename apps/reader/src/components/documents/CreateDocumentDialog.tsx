import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useEffect, useRef, useState } from "react";

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string) => void;
  loading?: boolean;
}

export function CreateDocumentDialog({
  open,
  onOpenChange,
  onCreate,
  loading = false,
}: CreateDocumentDialogProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset title when dialog opens
  useEffect(() => {
    if (open) {
      setTitle("");
      // Focus input after a short delay to ensure dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Fast-path: use "Untitled" if user submits empty title
    const finalTitle = title.trim() || "Untitled";
    onCreate(finalTitle);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create New Document" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          ref={inputRef}
          id="title"
          placeholder="Document Title (or press Enter for Untitled)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          aria-label="Document title"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
