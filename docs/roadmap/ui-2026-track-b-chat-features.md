# Track UI-B: Chat Features (Cherry Parity)

Owner: Agent Developer
Status: Complete
Branch: `feature/ui-2026-track-b-chat`
Dependencies: None (can start immediately)

## Objective

Implement Cherry Studio parity chat features: message actions (edit, retry, branch, copy), session management, and export functionality.

## Reference Documents

- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md` (P0 Chat Parity)
- `docs/specs/cowork/cowork-component-spec.md`

## Scope

- Message actions: edit, retry, branch, quote, copy
- Session list with search and management
- Export to Markdown/JSON
- Model selector per message

## Non-Goals

- Approval modal (Track UI-A)
- Inline task timeline (Track UI-C)
- Attachments (deferred to Phase 2)

## Component Reuse Guidelines

> **IMPORTANT**: Always use existing shell base components. Do NOT create custom styled elements.

| Need | Use This | Import From |
|------|----------|-------------|
| Buttons | `Button` | `@ku0/shell` |
| Search box | `SearchInput` | `@ku0/shell` |
| List items | `ListRow` | `@ku0/shell` |
| Context menus | `DropdownMenu` | `@ku0/shell` |
| Confirmations | `Dialog` | `@ku0/shell` |

Track UI-D will handle token compliance for all base components.

---

## Key Files to Modify

### Primary Files

1. **`apps/cowork/src/features/chat/ChatThread.tsx`**
   - Wire all message action handlers
   - Implement edit mode state

2. **`packages/shell/src/components/ai/MessageActions.tsx`**
   - Ensure actions call correct handlers

3. **`apps/cowork/src/components/sidebar/CoworkSidebarSections.tsx`**
   - Add session search filter
   - Wire rename/delete actions

4. **`apps/cowork/src/features/chat/utils/exportUtils.ts`**
   - Already exists, verify export functions work

---

## Implementation Tasks

### Task 1: Wire Edit Action

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

```tsx
const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
const [editContent, setEditContent] = useState('');

const handleEdit = (messageId: string, content: string) => {
  setEditingMessageId(messageId);
  setEditContent(content);
  setInput(content); // Populate composer
  inputRef.current?.focus();
};

const handleSendEdit = async () => {
  if (!editingMessageId) return;
  // Send as new message with parentId = editingMessageId
  await sendMessage(input, 'chat', {
    modelId: model,
    parentId: editingMessageId,
  });
  setEditingMessageId(null);
  setInput('');
};
```

Update AIPanel props:
```tsx
onEdit={(id) => {
  const msg = messages.find(m => m.id === id);
  if (msg) handleEdit(id, msg.content);
}}
```

### Task 2: Wire Retry Action

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

Verify `retryMessage` is passed correctly:
```tsx
onRetry={retryMessage}
```

This should already be wired. Verify in `useChatSession`:
```tsx
const retryMessage = async (messageId: string) => {
  // Find the user message that triggered this response
  // Resend with same content
};
```

### Task 3: Wire Branch Action

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

Already partially implemented:
```tsx
const handleBranch = useCallback((id: string) => {
  setBranchParentId(id);
  inputRef.current?.focus();
}, []);
```

Add visual indicator when branching:
```tsx
{branchParentId && (
  <div className="px-4 py-2 bg-surface-2 text-sm flex items-center gap-2">
    <span>Branching from message</span>
    <button onClick={() => setBranchParentId(null)}>Cancel</button>
  </div>
)}
```

### Task 4: Wire Copy Action

Already working:
```tsx
onCopy={(content) => {
  navigator.clipboard.writeText(content);
}}
```

Add toast feedback (optional enhancement).

### Task 5: Session Search and Management

**File**: `apps/cowork/src/components/sidebar/CoworkSidebarSections.tsx`

Add search state and filter:
```tsx
const [searchQuery, setSearchQuery] = useState('');

const filteredSessions = useMemo(() => {
  if (!searchQuery.trim()) return sessions;
  return sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
}, [sessions, searchQuery]);
```

Add search input at top of session list:
```tsx
<SearchInput
  placeholder="Search sessions..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  onClear={() => setSearchQuery('')}
/>
```

### Task 6: Session Rename and Delete

Add context menu or inline actions:
```tsx
const handleRename = async (sessionId: string, newTitle: string) => {
  await updateSession(sessionId, { title: newTitle });
};

const handleDelete = async (sessionId: string) => {
  if (confirm('Delete this session?')) {
    await deleteSession(sessionId);
  }
};
```

### Task 7: Export Functionality

**File**: `apps/cowork/src/features/chat/ChatThread.tsx`

Already implemented:
```tsx
const handleExport = useCallback(
  (format: 'markdown' | 'json') => {
    if (!messages.length || !session) return;
    if (format === 'markdown') {
      const md = exportToMarkdown(session, messages);
      downloadFile(`chat-export-${sessionId}.md`, md, 'text/markdown');
    } else {
      const json = exportToJson(session, messages);
      downloadFile(`chat-export-${sessionId}.json`, json, 'application/json');
    }
  },
  [messages, sessionId, session]
);
```

Add export button to header or message context menu.

---

## Acceptance Criteria

- [x] Edit: clicking edit populates composer with message content
- [x] Retry: clicking retry resends the user message
- [x] Branch: shows branch indicator, new message has parentId set
- [x] Copy: copies message content to clipboard
- [x] Search: session list filters as user types
- [x] Rename: double-click or context menu allows rename
- [x] Delete: confirmation dialog, session removed from list
- [x] Export: downloads .md or .json file

## Testing Strategy

> **Priority: MEDIUM** - Focus on testing core hooks/logic, not UI rendering.

### Recommended Tests (Optional)

Test core logic in hooks, skip pure UI rendering tests:

```tsx
// apps/cowork/src/features/chat/hooks/__tests__/useChatSession.test.ts
describe('useChatSession', () => {
  it('retryMessage uses same content as original', () => { ... });
  it('branch sets parentId correctly', () => { ... });
});
```

### Skip These Tests

- ❌ Message rendering tests (rely on TypeScript + visual QA)
- ❌ Sidebar filter UI tests (simple state logic)
- ❌ Export button click tests (trivial)

### Verification Method

```bash
# TypeScript is sufficient for most UI changes
pnpm typecheck

# Manual browser verification for UX
# 1. Send message, try edit/retry/branch
# 2. Search sessions, verify filter works
# 3. Export, verify file downloads
```

---

## Branch and PR Workflow

```bash
git checkout main && git pull
git checkout -b feature/ui-2026-track-b-chat

pnpm typecheck
pnpm test --filter cowork

git add -A
git commit -m "feat(ui): wire message actions and session management"
git push -u origin feature/ui-2026-track-b-chat

# Open PR: "feat(ui): Track UI-B - Chat Features (Cherry Parity)"
```

---

## Definition of Done

- [ ] All message actions functional
- [ ] Session search working
- [ ] Export downloads correct files
- [ ] TypeScript compiles without errors
- [ ] Tests pass
- [ ] PR opened and ready for review
