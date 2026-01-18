# Cowork UI Quality Gates

> **Role**: This document serves as the **Definition of Done** for any agent performing UI work on Cowork.
> **Enforcement**: Agents must explicitly check these 5 gates before requesting user review.

## Gate 1: The "No Magic Numbers" Check
*   **Rule**: No hardcoded pixel values for layout, padding, margin, or colors.
*   **Check**:
    *   `grep -r "px" .` (Should only return 0 matches in component logic, strictly limited to `1px` borders or SVG strokes).
    *   `grep -r "#" .` (Should return 0 matches for hex colors. Use `bg-surface-1`, `text-primary`, etc.).
*   **Corrective Action**: Replace with reference tokens (`spacing.4`, `text-sm`, `bg-surface-1`).

## Gate 2: The "Interaction Physics" Check
*   **Rule**: All interactive state changes (hover, click, mount) must be animated.
*   **Check**:
    *   Does the component use `framer-motion` (`<motion.div>`) for layout changes?
    *   Do hover states have `transition-colors duration-fast`?
*   **Corrective Action**: Wrap conditional rendering in `<AnimatePresence>` and use `layout` prop.

## Gate 3: The "Semantic Material" Check
*   **Rule**: Surfaces must follow the hierarchy.
*   **Check**:
    *   **Sidebar/Panels**: Must use `bg-surface-1` + `backdrop-blur`.
    *   **Cards/Inputs**: Must use `bg-surface-2` (higher opacity).
    *   **Text**: Primary is `text-foreground`, Secondary is `text-muted-foreground`.
*   **Corrective Action**: Refactor `bg-gray-100` or `bg-white` to `bg-surface-1`.

## Gate 4: The "Iconography" Check
*   **Rule**: All icons must be **Lucide React**.
*   **Check**:
    *   `import { ... } from "lucide-react"` used?
    *   Are custom SVGs used only for branding/logos?
*   **Corrective Action**: Replace ad-hoc SVGs with Lucide equivalents.

## Gate 5: The "Responsive & Accessible" Check
*   **Rule**: Controls must be hit-testable and keyboard accessible.
*   **Check**:
    *   Are clickable areas at least `h-8` / `h-10`?
    *   Do inputs have `focus:ring` states?
    *   Do buttons handle `disabled` and `loading` states visually?
*   **Corrective Action**: Add `disabled:opacity-50` and focus rings.

---

## Agent Verification Commands

Run these commands from the `apps/cowork/src` directory before requesting review:

```bash
# Gate 1: No Hex Colors (Should return 0 matches)
grep -rn '#[0-9A-Fa-f]\{3,6\}' --include="*.tsx" . | grep -v 'node_modules'

# Gate 2: No Arbitrary Spacing (Should return 0 matches)
grep -rn 'p-\[\|m-\[\|gap-\[\|w-\[\|h-\[' --include="*.tsx" . | grep -v 'node_modules'

# Gate 4: Lucide Icons Present (Should return matches if icons used)
grep -rn 'lucide-react' --include="*.tsx" . | head -5
```

If any gate fails, fix before proceeding.
