# Cowork Reference Implementation: "The Gold Standard"

> **Purpose**: This document provides a "Copy-Paste" standardized pattern for implementing components in Cowork.
> **Subject**: `<ChatInput />` (Complex, interactive, motion-heavy).

## 1. Directory Structure

Components live in feature folders (if specific) or `src/components/ui` (if generic).

```
src/features/chat/components/
└── ChatInput/
    ├── index.tsx       # Export
    ├── ChatInput.tsx   # Logic & Layout
    ├── InputArea.tsx   # The Textarea
    └── ActionButton.tsx # The Motion Button
```

## 2. The Implementation Pattern

### 2.1 Imports & Tokens
Always import atomic tokens via Tailwind classes. Use `cn()` for merging. Use standardized motion from `@ku0/design-system/motion`.

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { springStandard } from "@ku0/design-system/motion"; // Physics presets
import { cn } from "@/utils/cn";
import { CornerDownLeft, StopCircle, Plus as PlusIcon } from "lucide-react";
// ...
```

### 2.2 The "Gold Standard" Component Code

```tsx
/**
 * ChatInput
 * The primary interface for Agent interaction.
 *
 * Implements:
 * - "Dia" capsule style (rounded-3xl)
 * - Auto-growing textarea
 * - Optimistic UI updates
 * - Physics-based motion
 */

interface ChatInputProps {
  isLoading: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder?: string;
}

export function ChatInput({ isLoading, onSend, onStop, placeholder }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize logic (omitted for brevity, use standard hook)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!value.trim()) return;
      onSend(value);
      setValue("");
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6">
      <motion.div
        layout
        className={cn(
          "relative group flex items-end gap-2 p-2",
          "bg-surface-1/80 backdrop-blur-xl border border-white/10", // Glass Material
          "rounded-[28px] shadow-lg shadow-black/5", // "Capsule" Shape
          "transition-colors duration-300 hover:border-white/20 hover:bg-surface-1"
        )}
      >
        {/* Attachment Button (Left) */}
        <button className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors">
            <PlusIcon className="w-5 h-5" />
        </button>

        {/* Text Area (Center) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Ask anything..."}
          className={cn(
            "w-full bg-transparent border-0 ring-0 focus:ring-0",
            "text-base text-foreground placeholder:text-muted-foreground/50",
            "resize-none py-3 max-h-[200px] min-h-[44px]",
            "scrollbar-hide font-medium"
          )}
          rows={1}
        />

        {/* Action Button (Right) - The "Magical" Element */}
        <div className="shrink-0 pb-0.5">
            <ActionButton 
                mode={isLoading ? "stop" : value.trim() ? "send" : "inactive"} 
                onClick={() => isLoading ? onStop() : onSend(value)}
            />
        </div>
      </motion.div>
      
      {/* Footer Hints */}
      <div className="text-center mt-2 text-xs text-muted-foreground/40 font-medium">
        <span>Enter to send</span>
        <span className="mx-1">·</span>
        <span>Shift + Enter for new line</span>
      </div>
    </div>
  );
}
```

### 2.3 The "Motion" Sub-Component

```tsx
/**
 * ActionButton
 * Handles the morphing state between "Arrow" and "Stop".
 */
function ActionButton({ mode, onClick }: { mode: "send" | "stop" | "inactive", onClick: () => void }) {
  const isSend = mode === "send";
  const isStop = mode === "stop";

  return (
    <motion.button
      onClick={onClick}
      disabled={mode === "inactive"}
      layout
      initial={false}
      animate={{
        backgroundColor: isStop ? "var(--color-surface-2)" : isSend ? "var(--color-primary)" : "transparent",
        color: isStop ? "var(--color-foreground)" : isSend ? "var(--color-primary-foreground)" : "var(--color-muted-foreground)",
        scale: mode === "inactive" ? 0.9 : 1
      }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }} // Physics
      className={cn(
        "h-10 w-10 rounded-full flex items-center justify-center",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      <AnimatePresence mode="wait">
        {isStop ? (
          <motion.div
            key="stop"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
          >
            <StopCircle className="w-5 h-5 fill-current opacity-80" />
          </motion.div>
        ) : (
          <motion.div
            key="send"
            initial={{ scale: 0, x: -10 }}
            animate={{ scale: 1, x: 0 }}
            exit={{ scale: 0, x: 10 }}
          >
            <CornerDownLeft className="w-5 h-5" strokeWidth={2.5} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
```

## 3. Checklist for Implementers

When you write a new component, verify:

1.  [ ] **Class Names**: Are you using `bg-surface-X` and `text-muted-foreground`? (No hex codes).
2.  [ ] **Borders**: Is the border transparent/subtle (`border-white/10`)?
3.  [ ] **Motion**: Did you use `<motion.div>` for state changes? Is `layout` prop used for resizing?
4.  [ ] **Accessibility**: Does it handle keyboard events (`Enter` vs `Shift+Enter`)?
5.  [ ] **Icons**: Are Lucide icons properly sized (usually `w-4 h-4` or `w-5 h-5`)?
