# Track UI-D: Design Token Polish

Owner: Agent Developer
Status: Proposed
Branch: `feature/ui-2026-track-d-polish`
Dependencies: None (can start immediately, should merge last)

## Objective

Achieve design system compliance across all Cowork UI components. Eliminate hardcoded values, apply animation tokens, and enforce visual consistency.

## Reference Documents

- `docs/design-system/design-system.md`
- `docs/design-system/USAGE.md`
- `packages/design-system/src/theme.css`
- `packages/design-system/src/animations.css`
- `packages/design-system/src/tokens.ts`

## Scope

- Replace all hardcoded colors with tokens
- Apply animation timing tokens to transitions
- Unify typography to semantic scale
- Standardize border radius usage
- Ensure dark mode consistency
- **Optimize shell base components for full token compliance**

## Base Component Optimization

Track UI-D is responsible for ensuring all `@ku0/shell` components are token-compliant:

| Component | Status | Fix Needed |
|-----------|--------|------------|
| `Button.tsx` | ✅ Good | Minor: verify all variants |
| `Input.tsx` | ✅ Good | None |
| `Badge.tsx` | ✅ Good | None |
| `Card.tsx` | ✅ Good | None |
| `Dialog.tsx` | ⚠️ | Change `duration: 0.15` → CSS var |
| `Tooltip.tsx` | ✅ Good | None |
| `ListRow.tsx` | ✅ Good | None |

After Track UI-D completes, all other tracks inherit optimized components.

---

## Key Files to Audit and Fix

### High Priority (Hardcoded Colors Found)

1. **`apps/cowork/src/features/chat/ChatThread.tsx`**
   - Line 274: `border-gray-200/50 dark:border-gray-800/50` → `border-border/50`

2. **`apps/cowork/src/features/chat/AIHeaderActions.tsx`**
   - Line 17: `hover:bg-foreground/[0.05]` → `hover:bg-surface-2`
   - `text-xs` → `text-[11px] leading-[1.3]`

3. **All components using `transition-colors` without duration**
   - Add `duration-fast` or `duration-normal`

### Medium Priority (Typography)

4. **Components using raw Tailwind text sizes**
   - `text-xs` (12px) → Check if should be `--font-size-fine` (11px)
   - `text-sm` (14px) → Check if should be `--font-size-chrome` (13px)

### Low Priority (Consistency)

5. **Border radius variations**
   - Audit for `rounded` without suffix
   - Should be `rounded-md`, `rounded-lg`, etc.

---

## Implementation Tasks

### Task 1: Create Token Audit Script

**File**: `scripts/audit-tokens.sh`

```bash
#!/bin/bash
# Find hardcoded colors
echo "=== Hardcoded Gray Colors ==="
grep -rn "gray-[0-9]" apps/cowork/src packages/shell/src --include="*.tsx" --include="*.ts"

echo "=== Hardcoded Zinc Colors ==="
grep -rn "zinc-[0-9]" apps/cowork/src packages/shell/src --include="*.tsx" --include="*.ts"

echo "=== Hex Colors ==="
grep -rn "#[0-9a-fA-F]\{3,6\}" apps/cowork/src packages/shell/src --include="*.tsx" --include="*.ts"

echo "=== Transition without duration ==="
grep -rn "transition-colors\|transition-all" apps/cowork/src packages/shell/src --include="*.tsx" | grep -v "duration-"
```

### Task 2: Fix ChatThread Hardcoded Colors

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

```diff
- className="... border-gray-200/50 dark:border-gray-800/50 ..."
+ className="... border-border/50 ..."
```

### Task 3: Fix AIHeaderActions

**File**: `apps/cowork/src/features/chat/AIHeaderActions.tsx`

```diff
- className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-foreground/[0.05] transition-colors"
+ className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-surface-2 transition-colors duration-fast"
```

### Task 4: Add Animation Classes to Messages

**File**: `packages/shell/src/components/ai/MessageBubble.tsx`

Apply entry animation from `animations.css`:
```diff
- className="message-bubble ..."
+ className="message-bubble ai-message-enter ..."
```

### Task 5: Create Semantic Typography Classes

**File**: `apps/cowork/src/styles/base.css`

Add semantic typography utilities:
```css
/* Chrome text (UI controls, labels, nav) */
.text-chrome {
  font-size: var(--font-size-chrome);
  line-height: var(--line-height-chrome);
}

/* Fine text (secondary UI, metadata) */
.text-fine {
  font-size: var(--font-size-fine);
  line-height: var(--line-height-fine);
}

/* Content text (main body) */
.text-content {
  font-size: var(--font-size-content);
  line-height: var(--line-height-content);
}
```

### Task 6: Scrollbar Consistency

Ensure all scrollable containers use:
```tsx
className={cn(
  "overflow-y-auto",
  "[&::-webkit-scrollbar]:w-1.5",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:bg-transparent",
  "hover:[&::-webkit-scrollbar-thumb]:bg-border/40",
  "[&::-webkit-scrollbar-thumb]:rounded-full"
)}
```

### Task 7: Dark Mode Audit

Run app in dark mode and verify:
- [ ] No white flashes
- [ ] All backgrounds use surface tokens
- [ ] Text has proper contrast
- [ ] Borders use `border-border`

---

## Files to Modify (Complete List)

| File | Issues | Priority |
|------|--------|----------|
| `ChatThread.tsx` | Hardcoded border colors | High |
| `AIHeaderActions.tsx` | Magic opacity, wrong text size | High |
| `MessageBubble.tsx` | Missing animation class | Medium |
| `Sidebar.tsx` | Verify token usage | Medium |
| `base.css` | Add semantic typography | Medium |
| All scrollable containers | Scrollbar consistency | Low |

---

## Acceptance Criteria

- [ ] Zero hardcoded gray/zinc colors in cowork and shell
- [ ] All `transition-*` have duration tokens
- [ ] Semantic typography classes created and documented
- [ ] Messages animate in using `ai-message-enter`
- [ ] Scrollbars styled consistently
- [ ] Dark mode passes visual audit
- [ ] Token audit script runs clean

## Testing Strategy

> **Priority: LOW** - Pure styling changes. No automated tests required.

### Verification Method

```bash
# 1. Run token audit (should return empty)
./scripts/audit-tokens.sh

# 2. TypeScript check
pnpm typecheck

# 3. Visual verification (manual)
#    - Light mode: check all components
#    - Dark mode: check contrast and colors
#    - Hover/focus states: verify animations
#    - Reduced motion: test with prefers-reduced-motion
```

### Skip These Tests

- ❌ Unit tests (no logic changes)
- ❌ Snapshot tests (brittle for styling)
- ❌ E2E tests (overkill for polish)

---

## Branch and PR Workflow

```bash
git checkout main && git pull
git checkout -b feature/ui-2026-track-d-polish

# Run audit first
./scripts/audit-tokens.sh > audit-before.txt

# Make fixes...

# Run audit again (should be empty)
./scripts/audit-tokens.sh

pnpm typecheck

git add -A
git commit -m "fix(ui): design token compliance and polish"
git push -u origin feature/ui-2026-track-d-polish

# Open PR: "fix(ui): Track UI-D - Design Token Polish"
```

---

## Definition of Done

- [ ] Token audit script returns no violations
- [ ] Semantic typography classes added to base.css
- [ ] Animation classes applied to messages
- [ ] Dark mode visual audit passed
- [ ] TypeScript compiles without errors
- [ ] PR opened and ready for review
