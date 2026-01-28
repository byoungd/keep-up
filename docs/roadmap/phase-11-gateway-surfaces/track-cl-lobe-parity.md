# Track CL: LobeHub Parity & UX Optimization

> Priority: P1
> Status: Ready
> Owner: Team
> Dependencies: @ku0/design-system, @ku0/cowork, @ku0/ai-core
> Source: Phase 11 - Gateway Surfaces

---

## Objective

Elevate `apps/cowork` to match **LobeHub (LobeChat)** in UX polish, agent discovery, and multi-model session management. Leverage existing infrastructure (ModelSelector, SettingsPage, design tokens) and enhance with premium aesthetics, glassmorphism, and an Agent Market.

---

## Scope

### 1. Visual Polish (Design System Enhancements)
- Introduce `--color-glass-*` tokens for glassmorphism effects (backdrop-blur panels)
- Add gradient accent tokens: `--gradient-ai`, `--gradient-premium`
- Refine existing CSS animations in `animations.css` for smoother micro-interactions
- Update sidebar/panel borders with subtle gradient strokes

### 2. Agent Market / Discovery Page
- New route `/market` in `apps/cowork/src/app/routes/MarketRoute.tsx`
- `AgentCard` component: Avatar, Name, Description, Tags, Install/Enable button
- Agent registry integration via `@ku0/gateway-control` or mock data for initial phase
- Filter/Search capabilities for agents

### 3. Session Header Model Selector Enhancement
- Utilize existing `ModelSelector` component (`features/settings/ModelSelector.tsx`)
- Add compact "in-session" variant for use in `SessionHeader`
- Persist last-used model per session (via existing hooks/stores)

### 4. Settings Page Refinements
- Existing `SettingsPage.tsx` (1496 lines) covers Providers, Theme, Policy, Audit, Checkpoints
- Enhance with:
  - Tab-based navigation (vertical sidebar tabs)
  - Import/Export data sovereignty flows
  - Onboarding wizard for first-time setup (optional stretch)

---

## Out of Scope

- Backend model routing changes (assume gateway supports it)
- Mobile native app development
- New LLM provider integrations (use existing `@ku0/ai-core` providers)

---

## Implementation Spec (Executable)

### Step 1: Design System - Glass & Gradient Tokens

**Target File:** `packages/design-system/src/theme.css`

Add inside `@theme` block:
```css
/* Glassmorphism */
--glass-bg: rgba(255, 255, 255, 0.6);
--glass-bg-dark: rgba(9, 9, 11, 0.7);
--glass-backdrop: blur(16px);
--glass-border: rgba(255, 255, 255, 0.1);

/* Premium Gradients */
--gradient-ai: linear-gradient(135deg, var(--color-accent-violet) 0%, var(--color-accent-indigo) 100%);
--gradient-premium: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

Add dark mode overrides in `.dark` block:
```css
--glass-bg: rgba(24, 24, 27, 0.75);
--glass-border: rgba(255, 255, 255, 0.05);
```

### Step 2: Glass Panel Component

**Target File (NEW):** `apps/cowork/src/components/GlassPanel.tsx`

```tsx
import { cn } from "../lib/cn";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  intensity?: "light" | "medium" | "strong";
}

export function GlassPanel({ children, intensity = "medium", className, ...props }: GlassPanelProps) {
  const intensityClass = {
    light: "backdrop-blur-sm bg-white/40 dark:bg-zinc-900/50",
    medium: "backdrop-blur-md bg-white/60 dark:bg-zinc-900/70",
    strong: "backdrop-blur-lg bg-white/80 dark:bg-zinc-900/85",
  }[intensity];

  return (
    <div
      className={cn(
        intensityClass,
        "border border-white/10 dark:border-white/5 rounded-xl shadow-soft",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
```

### Step 3: Market Route & AgentCard

**Target File (NEW):** `apps/cowork/src/app/routes/MarketRoute.tsx`

```tsx
import { useState } from "react";
import { GlassPanel } from "../../components/GlassPanel";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: string;
  tags: string[];
  installed: boolean;
}

const MOCK_AGENTS: Agent[] = [
  { id: "code-assistant", name: "Code Assistant", description: "AI pair programmer with deep codebase understanding", avatar: "🤖", tags: ["coding", "productivity"], installed: true },
  { id: "writer", name: "Content Writer", description: "Generate articles, docs, and creative content", avatar: "✍️", tags: ["writing", "creative"], installed: false },
  { id: "analyst", name: "Data Analyst", description: "SQL queries, data viz, and insights", avatar: "📊", tags: ["data", "analytics"], installed: false },
];

function AgentCard({ agent, onToggle }: { agent: Agent; onToggle: () => void }) {
  return (
    <GlassPanel className="p-4 flex gap-4 items-start hover:scale-[1.02] transition-transform">
      <div className="text-4xl">{agent.avatar}</div>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground">{agent.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
        <div className="flex gap-2 mt-2">
          {agent.tags.map((tag) => (
            <span key={tag} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{tag}</span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          agent.installed
            ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            : "bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90"
        }`}
      >
        {agent.installed ? "Remove" : "Install"}
      </button>
    </GlassPanel>
  );
}

export function MarketRoute() {
  const [agents, setAgents] = useState(MOCK_AGENTS);
  const [search, setSearch] = useState("");

  const filtered = agents.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.tags.some((t) => t.includes(search.toLowerCase()))
  );

  const toggleAgent = (id: string) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, installed: !a.installed } : a)));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Agent Market</h1>
      <input
        type="text"
        placeholder="Search agents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-6 px-4 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20"
      />
      <div className="grid gap-4">
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onToggle={() => toggleAgent(agent.id)} />
        ))}
      </div>
    </div>
  );
}
```

### Step 4: Register Market Route

**Target File:** `apps/cowork/src/app/router.tsx`

Add import and route definition:
```tsx
import { MarketRoute } from "./routes/MarketRoute";

const marketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/market",
  component: MarketRoute,
});

// Add to routeTree.addChildren([...])
```

### Step 5: Sidebar Navigation Update

Update `RootLayout` or sidebar component to add Market navigation link with icon.

---

## Deliverables

| Deliverable | File/Location | Status |
|-------------|---------------|--------|
| Glass tokens | `packages/design-system/src/theme.css` | `[ ]` |
| GlassPanel component | `apps/cowork/src/components/GlassPanel.tsx` | `[ ]` |
| MarketRoute page | `apps/cowork/src/app/routes/MarketRoute.tsx` | `[ ]` |
| Router registration | `apps/cowork/src/app/router.tsx` | `[ ]` |
| Sidebar Market link | `apps/cowork/src/app/layouts/RootLayout.tsx` | `[ ]` |

---

## Acceptance Criteria

- [ ] `/market` route is accessible and displays agent cards
- [ ] Glassmorphism effects render correctly in both light/dark modes
- [ ] Agent install/remove toggles work (local state, no backend required for MVP)
- [ ] Sidebar includes Market navigation with distinguishable icon
- [ ] No TypeScript errors (`pnpm typecheck --filter @ku0/cowork`)

---

## Validation

### Automated
```bash
# TypeCheck
pnpm typecheck --filter @ku0/cowork

# Lint
pnpm biome check --write
```

### Manual (Developer)
1. Run `pnpm dev --filter @ku0/cowork`
2. Navigate to `/market` - should display agent cards with glassmorphism effect
3. Toggle dark/light theme in Settings - glass effect should adapt
4. Click "Install" on an agent - button should change to "Remove"
5. Search for "coding" - should filter to Code Assistant agent

---

## Single-Doc Execution Checklist

1) **Create feature branch**
   ```bash
   git checkout -b feat/track-cl-lobe-parity
   ```

2) **Implement in order**
   - [ ] Add glass tokens to `theme.css`
   - [ ] Create `GlassPanel.tsx`
   - [ ] Create `MarketRoute.tsx`
   - [ ] Register route in `router.tsx`
   - [ ] Add sidebar link in `RootLayout.tsx`

3) **Validate**
   ```bash
   pnpm typecheck --filter @ku0/cowork
   pnpm biome check --write
   pnpm dev --filter @ku0/cowork
   ```

4) **Commit & PR**
   ```bash
   git add -A
   git commit -m "feat(cowork): track-cl lobe parity - agent market and glass ui"
   git push -u origin feat/track-cl-lobe-parity
   ```

---

## Future Enhancements (Phase 2)

- [ ] Connect Agent Market to gateway registry API
- [ ] Per-agent configuration panel
- [ ] Agent capability matrix visualization
- [ ] Settings page tab-based navigation refactor
- [ ] Session model switching in chat header
