import * as React from "react";
import { cn } from "../../utils/cn";
import { useAutosizeTextArea } from "./useAutosizeTextArea";

export type ChatComposerProps = {
  onSend: (content: string) => void;
  isBusy?: boolean;
  placeholder?: string;
  className?: string;
};

export function ChatComposer({
  onSend,
  isBusy = false,
  placeholder = "Describe the task or ask a question.",
  className,
}: ChatComposerProps) {
  const [value, setValue] = React.useState("");
  const textAreaRef = useAutosizeTextArea(value);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className={cn("composer-shell", className)}>
      <textarea
        ref={textAreaRef}
        className="composer-input"
        placeholder={placeholder}
        value={value}
        aria-label="Chat message"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            handleSend();
          }
        }}
        rows={1}
        disabled={isBusy}
      />
      <div className="composer-actions">
        <p className="text-[11px] text-muted-foreground">Cmd/Ctrl + Enter</p>
        <button type="button" className="primary-button" onClick={handleSend} disabled={isBusy}>
          {isBusy ? "Working..." : "Send"}
        </button>
      </div>
    </div>
  );
}
