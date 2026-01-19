# Track UI-A: Controls and Approvals Wiring

Owner: Agent Developer
Status: Completed
Branch: `feature/ui-2026-track-a-controls`
Dependencies: None (can start immediately)

## Objective

Wire the tool governance and approval system from agent-runtime into the Cowork UI. Enable users to see, approve, and reject tool calls with proper risk visualization.

## Reference Documents

- `docs/specs/agent-runtime-spec-2026.md` Section 5.3 (Tool Governance)
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md` (Target UX)
- `docs/specs/cowork/cowork-safety-spec.md` (Risk levels)

## Scope

- Approval modal triggered by SSE events
- Risk level display with semantic colors
- Approve/Reject actions wired to backend
- Tool call visibility in message stream

## Non-Goals

- Background task queue (Track UI-C)
- Message edit/branch actions (Track UI-B)
- Design token polish (Track UI-D)

## Component Reuse Guidelines

> **IMPORTANT**: Always use existing shell base components. Do NOT create custom styled elements.

| Need | Use This | Import From |
|------|----------|-------------|
| Buttons | `Button` | `@ku0/shell` |
| Risk badges | `Badge` | `@ku0/shell` |
| Modal container | `Dialog` | `@ku0/shell` |
| Cards | `Card` | `@ku0/shell` |
| Tooltips | `Tooltip` | `@ku0/shell` |

Track UI-D will handle token compliance for all base components.

---

## Key Files to Modify

### Primary Files

1. **`apps/cowork/src/features/chat/ChatThread.tsx`**
   - Wire `onTaskAction` handler for approvals
   - Pass approval metadata to ShellAIPanel

2. **`packages/shell/src/components/ai/AIPanel.tsx`**
   - Add approval modal trigger on `task.approval` event
   - Render ApprovalCard component

3. **`packages/shell/src/components/ui/Dialog.tsx`**
   - Ensure modal blocking behavior works correctly

### New Files to Create

1. **`packages/shell/src/components/ai/ApprovalCard.tsx`**
   ```tsx
   interface ApprovalCardProps {
     toolName: string;
     toolDescription: string;
     parameters: Record<string, unknown>;
     riskLevel: 'low' | 'medium' | 'high' | 'critical';
     onApprove: () => void;
     onReject: () => void;
   }
   ```

---

## Implementation Tasks

### Task 1: Create ApprovalCard Component

**File**: `packages/shell/src/components/ai/ApprovalCard.tsx`

```tsx
// Skeleton structure
export function ApprovalCard({
  toolName,
  toolDescription,
  parameters,
  riskLevel,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const riskColors = {
    low: 'bg-accent-emerald/10 text-accent-emerald',
    medium: 'bg-accent-amber/10 text-accent-amber',
    high: 'bg-accent-rose/10 text-accent-rose',
    critical: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="border border-border rounded-xl p-4 bg-surface-1">
      <div className="flex items-center gap-2 mb-3">
        <Badge className={riskColors[riskLevel]}>{riskLevel.toUpperCase()}</Badge>
        <span className="font-semibold">{toolName}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{toolDescription}</p>
      <pre className="text-xs bg-surface-2 p-2 rounded-md mb-4 overflow-x-auto">
        {JSON.stringify(parameters, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button variant="destructive" onClick={onReject}>Reject</Button>
        <Button variant="primary" onClick={onApprove}>Approve</Button>
      </div>
    </div>
  );
}
```

### Task 2: Wire Approval Events in AIPanel

**File**: `packages/shell/src/components/ai/AIPanel.tsx`

Add state and handler for approval:

```tsx
const [pendingApproval, setPendingApproval] = useState<ApprovalData | null>(null);

// In event handler for SSE:
case 'task.approval':
  setPendingApproval({
    approvalId: event.data.approvalId,
    toolName: event.data.toolName,
    toolDescription: event.data.toolDescription,
    parameters: event.data.parameters,
    riskLevel: event.data.riskLevel,
  });
  break;

// Handle approve/reject
const handleApprove = () => {
  onTaskAction?.('approve', { approvalId: pendingApproval.approvalId });
  setPendingApproval(null);
};
```

### Task 3: Wire ChatThread to Send Actions

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

Verify `onTaskAction` is correctly wired:

```tsx
onTaskAction={(action, metadata) => sendAction(action, { approvalId: metadata.approvalId })}
```

### Task 4: Add Risk Color Tokens

**File**: `packages/design-system/src/theme.css`

Verify these tokens exist (should already be present):

```css
--color-accent-emerald: #10b981;
--color-accent-amber: #f59e0b;
--color-accent-rose: #f43f5e;
```

---

## Acceptance Criteria

- [ ] When a tool requires approval, ApprovalCard appears inline in chat
- [ ] Risk level badge shows correct color (emerald/amber/rose/red)
- [ ] "Approve" button resumes task execution
- [ ] "Reject" button cancels the tool call
- [ ] Parameters are displayed in readable JSON format
- [ ] Keyboard accessible (Tab to buttons, Enter to activate)

## Required Tests

> **Priority: HIGH** - This track handles security-critical approval flows. Tests are mandatory.

### Component Tests (Required)

Create `packages/shell/src/components/ai/__tests__/ApprovalCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalCard } from '../ApprovalCard';

describe('ApprovalCard', () => {
  const defaultProps = {
    toolName: 'writeFile',
    toolDescription: 'Writes content to a file',
    parameters: { path: '/test.txt', content: 'hello' },
    riskLevel: 'medium' as const,
    onApprove: vi.fn(),
    onReject: vi.fn(),
  };

  it('renders tool name and description', () => {
    render(<ApprovalCard {...defaultProps} />);
    expect(screen.getByText('writeFile')).toBeInTheDocument();
    expect(screen.getByText('Writes content to a file')).toBeInTheDocument();
  });

  it('displays risk level badge with correct styling', () => {
    render(<ApprovalCard {...defaultProps} riskLevel="critical" />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  it('calls onApprove when Approve clicked', () => {
    render(<ApprovalCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(defaultProps.onApprove).toHaveBeenCalled();
  });

  it('calls onReject when Reject clicked', () => {
    render(<ApprovalCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(defaultProps.onReject).toHaveBeenCalled();
  });

  it('is keyboard accessible', () => {
    render(<ApprovalCard {...defaultProps} />);
    const approveBtn = screen.getByText('Approve');
    approveBtn.focus();
    fireEvent.keyDown(approveBtn, { key: 'Enter' });
    expect(defaultProps.onApprove).toHaveBeenCalled();
  });
});
```

### Run Tests

```bash
pnpm --filter @ku0/shell test -- ApprovalCard
```

---

## Branch and PR Workflow

```bash
# Start from main
git checkout main && git pull
git checkout -b feature/ui-2026-track-a-controls

# After implementation
pnpm typecheck
pnpm test --filter @ku0/shell

# Commit and push
git add -A
git commit -m "feat(ui): wire approval controls and risk display"
git push -u origin feature/ui-2026-track-a-controls

# Open PR with title: "feat(ui): Track UI-A - Controls and Approvals"
```

---

## Definition of Done

- [ ] All tasks implemented
- [ ] TypeScript compiles without errors
- [ ] Unit tests pass
- [ ] Manual integration test passed
- [ ] PR opened and ready for review
