# Track UI-C: Runtime Visualization

Owner: Agent Developer
Status: Proposed
Branch: `feature/ui-2026-track-c-runtime-viz`
Dependencies: Track UI-A (approval card pattern)

## Objective

Expose agent-runtime internals in the UI: inline task timeline, model/cost transparency, background task queue, and delegation visibility.

## Reference Documents

- `docs/specs/agent-runtime-spec-2026.md` (Sections 5.4, 5.6, 5.9)
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md` (P0 Agent Task Mode)
- `docs/roadmap/agent-runtime-2026-track-c-checkpoint-eventlog.md`
- `docs/roadmap/agent-runtime-2026-track-d-delegation-messaging.md`

## Scope

- Inline task timeline in assistant messages
- Model badge and cost display per message
- Background task indicators
- Child agent / delegation visibility

## Non-Goals

- Approval modal (Track UI-A)
- Message edit/branch (Track UI-B)
- Design token polish (Track UI-D)

## Component Reuse Guidelines

> **IMPORTANT**: Always use existing shell base components. Do NOT create custom styled elements.

| Need | Use This | Import From |
|------|----------|-------------|
| Badges | `Badge` | `@ku0/shell` |
| Buttons | `Button` | `@ku0/shell` |
| Status indicators | `Badge` variants | `@ku0/shell` |
| Tooltips | `Tooltip` | `@ku0/shell` |
| Collapsible sections | Use `ChevronRight` icon + state | lucide-react |

Track UI-D will handle token compliance for all base components.

---

## Key Files to Modify

### Primary Files

1. **`apps/cowork/src/features/chat/ChatThread.tsx`**
   - Pass task metadata to message components
   - Wire cost meter component

2. **`apps/cowork/src/features/chat/components/CostMeter.tsx`**
   - Display tokens and estimated cost

3. **`packages/shell/src/components/ai/MessageBubble.tsx`**
   - Add model badge rendering
   - Add inline timeline slot

### New Files to Create

1. **`packages/shell/src/components/ai/TaskTimeline.tsx`**
2. **`packages/shell/src/components/ai/ModelBadge.tsx`**
3. **`packages/shell/src/components/ai/BackgroundTaskIndicator.tsx`**

---

## Implementation Tasks

### Task 1: Create ModelBadge Component

**File**: `packages/shell/src/components/ai/ModelBadge.tsx`

```tsx
interface ModelBadgeProps {
  modelId: string;
  providerId?: string;
  fallbackNotice?: string;
}

export function ModelBadge({ modelId, providerId, fallbackNotice }: ModelBadgeProps) {
  return (
    <div className="inline-flex items-center gap-1.5 text-micro text-muted-foreground">
      <span className="font-medium">{modelId}</span>
      {providerId && <span className="opacity-60">via {providerId}</span>}
      {fallbackNotice && (
        <span className="text-accent-amber text-micro">({fallbackNotice})</span>
      )}
    </div>
  );
}
```

### Task 2: Create Inline TaskTimeline Component

**File**: `packages/shell/src/components/ai/TaskTimeline.tsx`

```tsx
interface TaskStep {
  id: string;
  type: 'tool_call' | 'approval' | 'artifact' | 'delegation';
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: number;
  details?: string;
}

interface TaskTimelineProps {
  steps: TaskStep[];
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export function TaskTimeline({ steps, isCollapsed, onToggle }: TaskTimelineProps) {
  if (steps.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-90")} />
        <span>{steps.length} steps</span>
      </button>
      
      {!isCollapsed && (
        <div className="mt-2 space-y-1 pl-4 border-l border-border/50">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-sm">
              <StatusDot status={step.status} />
              <span className="font-mono text-micro">{step.name}</span>
              {step.details && (
                <span className="text-muted-foreground truncate">{step.details}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Task 3: Wire Model Badge to Messages

**File**: `packages/shell/src/components/ai/MessageBubble.tsx`

Add to assistant message rendering:
```tsx
{message.role === 'assistant' && message.modelId && (
  <div className="mt-2">
    <ModelBadge 
      modelId={message.modelId} 
      providerId={message.providerId}
      fallbackNotice={message.fallbackNotice}
    />
  </div>
)}
```

### Task 4: Wire CostMeter to Header

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

Already exists:
```tsx
<CostMeter usage={usage} modelId={model} />
```

Verify `usage` object contains:
```tsx
interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}
```

### Task 5: Create BackgroundTaskIndicator

**File**: `packages/shell/src/components/ai/BackgroundTaskIndicator.tsx`

```tsx
interface BackgroundTask {
  id: string;
  title: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
}

interface BackgroundTaskIndicatorProps {
  tasks: BackgroundTask[];
  onViewTask: (taskId: string) => void;
}

export function BackgroundTaskIndicator({ tasks, onViewTask }: BackgroundTaskIndicatorProps) {
  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'queued');
  
  if (activeTasks.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 rounded-full text-sm">
      <div className="h-2 w-2 rounded-full bg-accent-amber animate-pulse" />
      <span>{activeTasks.length} task{activeTasks.length > 1 ? 's' : ''} running</span>
    </div>
  );
}
```

### Task 6: Wire Timeline to Task Messages

In the message list rendering, detect if message has `taskId`:
```tsx
{message.taskId && (
  <TaskTimeline
    steps={getTaskSteps(message.taskId)}
    isCollapsed={collapsedTimelines[message.taskId]}
    onToggle={() => toggleTimeline(message.taskId)}
  />
)}
```

---

## Acceptance Criteria

- [ ] Model badge shows on every assistant message
- [ ] Fallback notice displayed when model routing occurred
- [ ] Task messages show collapsible timeline
- [ ] Timeline shows tool calls, approvals, artifacts
- [ ] Cost meter displays token usage
- [ ] Background task indicator shows in header when tasks are running

## Testing Strategy

> **Priority: MEDIUM** - Focus on data transformation logic, not UI rendering.

### Recommended Tests (Optional)

```tsx
// packages/shell/src/components/ai/__tests__/TaskTimeline.test.tsx
describe('TaskTimeline', () => {
  it('renders correct step count', () => { ... });
  it('toggles collapse state', () => { ... });
});

describe('ModelBadge', () => {
  it('shows fallback notice when present', () => { ... });
});
```

### Skip These Tests

- ❌ Pure rendering snapshots
- ❌ CSS class assertions
- ❌ BackgroundTaskIndicator (trivial component)

### Verification Method

```bash
pnpm typecheck

# Manual verification:
# 1. Run a task, verify model badge appears
# 2. Expand/collapse timeline
# 3. Check cost meter shows correct values
```

---

## Branch and PR Workflow

```bash
git checkout main && git pull
git checkout -b feature/ui-2026-track-c-runtime-viz

pnpm typecheck
pnpm test

git add -A
git commit -m "feat(ui): add runtime visualization components"
git push -u origin feature/ui-2026-track-c-runtime-viz

# Open PR: "feat(ui): Track UI-C - Runtime Visualization"
```

---

## Definition of Done

- [ ] ModelBadge component created and integrated
- [ ] TaskTimeline component created and integrated
- [ ] CostMeter wired correctly
- [ ] BackgroundTaskIndicator created
- [ ] TypeScript compiles without errors
- [ ] Tests pass
- [ ] PR opened and ready for review
