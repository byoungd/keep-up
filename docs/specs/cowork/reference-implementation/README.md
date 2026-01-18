# Reference Implementation Examples

> **Purpose**: Illustrative code snippets demonstrating correct application of the Design System v3.
> These are **pseudo-code examples** to be adapted, not imported directly.

---

## Button Component (Gold Standard)

**Key Principles**:
1.  **`rounded-lg`** (12px Squircle).
2.  **No gradients** for standard variants (Tuesday Morning).
3.  **`magic` variant** with gradient is reserved for AI triggers (Novelty Spend).

```tsx
// apps/cowork/src/components/ui/Button.tsx
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    // Base Style
    "inline-flex items-center justify-center",
    "rounded-lg text-sm font-medium",       // Squircle + Dense Typography
    "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.98]",                  // Tactile Click
    "transition-colors duration-150",       // Fast, never slow
  ],
  {
    variants: {
      variant: {
        // ✅ Tuesday Morning (Boring)
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        
        // ✨ The Novelty Spend (AI Power ONLY)
        magic: "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-500/25 shadow-lg",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",         // Note: Keep rounded-lg
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export function Button({ className, variant, size, ...props }) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

---

## Sidebar Component (Gold Standard)

**Key Principles**:
1.  **Structural**: It holds the "State" (Sessions, Context). Solid material.
2.  **No decorative blur**: `bg-surface-1` is a solid (or near-solid) color.
3.  **Organization**: Sections are **Workspace Switcher**, **Pinned**, **Recent**.

```tsx
// apps/cowork/src/components/layout/Sidebar.tsx
import { cn } from "@/lib/utils";

export function Sidebar({ className, children }) {
  return (
    <aside
      className={cn(
        // Dimensions (Arc-style: Generous width, full height)
        "h-full w-[240px] flex flex-col shrink-0",
        // Material (Solid, NOT blurred)
        "bg-surface-1 border-r border-border/30",
        // Typography
        "text-[13px] font-medium text-muted-foreground",
        className
      )}
    >
      {/* Section: Workspace Switcher */}
      <div className="h-12 flex items-center px-4 border-b border-border/20">
        <span className="text-foreground font-semibold">Cowork</span>
      </div>

      {/* Section: Pinned + Tree (Scrollable) */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {children}
      </div>

      {/* Section: User Settings */}
      <div className="h-12 flex items-center px-4 mt-auto hover:bg-surface-2/50 transition-colors cursor-pointer rounded-md mx-2 mb-2">
        <span className="text-foreground">Settings</span>
      </div>
    </aside>
  );
}

// Sidebar Item: The "Tab"
export function SidebarItem({ active, icon: Icon, label }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors select-none",
        "hover:bg-surface-2",
        active && "bg-surface-2 text-foreground shadow-sm"
      )}
    >
      <Icon className="w-4 h-4 opacity-70" />
      <span>{label}</span>
    </div>
  );
}
```

---

## Input Capsule (Gold Standard)

**Key Principles**:
1.  **Pill Shape**: `rounded-full` or `rounded-xl`.
2.  **Floating**: `shadow-lg` gives it elevation.
3.  **Center -> Bottom**: Position shifts based on content state.

```tsx
// apps/cowork/src/components/chat/InputCapsule.tsx

export function InputCapsule({ empty = true }) {
  return (
    <div
      className={cn(
        // Shape: Pill
        "rounded-full",
        // Material: Elevated
        "bg-background border border-border shadow-lg",
        // Typography
        "text-base placeholder:text-muted-foreground",
        // State: Position
        empty ? "mx-auto max-w-xl" : "fixed bottom-6 left-1/2 -translate-x-1/2 max-w-3xl w-full"
      )}
    >
      <input
        type="text"
        placeholder="Ask anything..."
        className="w-full bg-transparent px-6 py-4 outline-none"
      />
    </div>
  );
}
```

---

## When to Use These

*   **Agent Task**: "Build a button component" → Copy Button snippet, adapt.
*   **Self-Review**: Check your implementation against these. Deviations must be justified.
