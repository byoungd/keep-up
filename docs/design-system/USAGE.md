# Design System Usage Guide

This document explains how to consume design tokens and follow component patterns in the `@keepup/reader` application.

---

## The Token Pipeline

Our design system follows a **CSS Variable-first** approach.

```
globals.css (@theme) --> tailwind.config.ts --> Component (via Tailwind utilities)
         \
          --> tokens.ts (for JS/TS logic)
```

1.  **Definition**: `apps/reader/app/globals.css` defines strict CSS variables using Tailwind v4's `@theme` directive (e.g., `--color-primary`, `--radius-md`, `--duration-fast`).
2.  **Mapping**: `apps/reader/tailwind.config.ts` extends the theme by mapping utilities (e.g., `bg-primary`, `rounded-lg`, `duration-fast`) to these CSS variables.
3.  **Consumption**: Components use Tailwind utility classes. For TypeScript logic, import from `@/styles/tokens.ts`.

**Why CSS Variables?**
- Automatic Dark Mode: All components adapt without needing explicit class toggles.
- Centralized Changes: Update one variable, and it propagates everywhere.
- Runtime Theming: Future themes can be applied by simply overriding CSS variables.

---

## Component Architecture

We use a layered approach for building reusable UI components.

### Core Technologies
- **Radix UI Primitives**: For accessibility behaviors (focus trapping, keyboard navigation, portals).
- **Class Variance Authority (CVA)**: For managing component variants (size, color, intent).
- **`cn()` Utility**: Merges Tailwind classes cleanly using `tailwind-merge` & `clsx`.

### Example Pattern: Button

```tsx
// Button.tsx (simplified)
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md ...", // Base styles
  {
    variants: {
      variant: { primary: "...", secondary: "...", ghost: "..." },
      size: { default: "h-9 px-4", sm: "h-8 px-3", lg: "h-11 px-6" },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  // ...
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

---

## Using Tokens in TypeScript

For logic that requires design values (e.g., animation timing, spacing calculations):

```tsx
import { transitionDuration, spacing } from "@/styles/tokens";

const animationStyle = {
  transition: `transform ${transitionDuration.fast} ease-out`,
  margin: spacing[4], // "1rem" (16px)
};
```

---

## File Reference

| File | Purpose |
| :--- | :--- |
| `app/globals.css` | CSS variable definitions, base styles, animations |
| `tailwind.config.ts` | Maps CSS vars to Tailwind utilities |
| `src/styles/tokens.ts` | TypeScript-safe token constants |
| `src/lib/utils.ts` | `cn()` helper function |
| `src/components/ui/` | All reusable UI primitives |
