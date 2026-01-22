import { getDefaultModelId, MODEL_CATALOG } from "@ku0/ai-core";
import { AIPanel, type Message } from "@ku0/shell";
import { Sparkles } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, InputCapsule, StatusDot, ThinkingBar } from "../../components/ui";

const THEME_TOKEN_KEYS = [
  "--color-background",
  "--color-foreground",
  "--color-muted",
  "--color-muted-foreground",
  "--color-border",
  "--color-input",
  "--color-ring",
  "--color-primary",
  "--color-primary-foreground",
  "--color-theme-base",
  "--color-sidebar",
  "--color-canvas",
  "--color-surface-0",
  "--color-surface-1",
  "--color-surface-2",
  "--color-surface-3",
  "--color-surface-elevated",
  "--color-accent-ai",
  "--color-accent-indigo",
  "--color-success",
  "--color-warning",
  "--color-info",
  "--color-error",
] as const;

type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];

const CHAT_SUGGESTIONS = [
  "Summarize the last meeting notes",
  "Draft a weekly update email",
  "Generate a project risk list",
];

const CHAT_TRANSLATIONS = {
  title: "AI Assistant",
  statusStreaming: "Streaming...",
  statusDone: "Done",
  statusError: "Error",
  statusCanceled: "Canceled",
  emptyTitle: "What can I do for you?",
  emptyDescription: "Assign a task or ask anything.",
  you: "You",
  assistant: "Assistant",
  actionEdit: "Edit",
  actionBranch: "Branch",
  actionQuote: "Quote",
  actionCopy: "Copy",
  actionRetry: "Retry",
  requestIdLabel: "Request ID",
  copyLast: "Copy Last",
  newChat: "New Chat",
  closePanel: "Close",
  exportChat: "Export",
  attachmentsLabel: "Attachments",
  addImage: "Add Image",
  runBackground: "Run in Background",
  removeAttachment: "Remove",
  inputPlaceholder: "Ask anything...",
  attachmentsMeta: "",
  referenceLabel: "Ref",
  referenceResolved: "Resolved",
  referenceRemapped: "Remapped",
  referenceUnresolved: "Unresolved",
  referenceFind: "Find",
  referenceUnavailable: "Unavailable",
  alertTitleError: "Error",
  alertTitleCanceled: "Canceled",
  alertBodyError: "Something went wrong.",
  alertBodyCanceled: "Request was canceled.",
  alertRetry: "Retry",
  statusLabels: {
    streaming: "Streaming",
    done: "Done",
    error: "Error",
    canceled: "Canceled",
    pending: "Pending",
  },
  alertLabels: {
    titleError: "Error",
    titleCanceled: "Canceled",
    bodyError: "Error",
    bodyCanceled: "Canceled",
    retry: "Retry",
  },
} as const;

const SAMPLE_CHAT_MESSAGES: Message[] = [
  {
    id: "foundation-msg-1",
    role: "user",
    content: "Draft a quick recap of today's sync and list the action items.",
    createdAt: Date.now() - 1000 * 60 * 6,
    status: "done",
  },
  {
    id: "foundation-msg-2",
    role: "assistant",
    content:
      "Here is a short recap with owners and due dates:\n\n- **Decision:** Ship the AI polish pass on Friday.\n- **Action:** Mei to update the onboarding tour by EOD.\n- **Action:** Luis to confirm the analytics contract.",
    createdAt: Date.now() - 1000 * 60 * 5,
    status: "done",
  },
];

function useThemeTokens(mode: "light" | "dark"): CSSProperties {
  const [tokens, setTokens] = useState<CSSProperties>({ colorScheme: mode });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const probe = document.createElement("div");
    if (mode === "dark") {
      probe.classList.add("dark");
    }
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe);
    const next: CSSProperties = { colorScheme: mode };

    for (const key of THEME_TOKEN_KEYS) {
      const value = computed.getPropertyValue(key).trim();
      if (value) {
        (next as Record<ThemeTokenKey, string>)[key] = value;
      }
    }

    probe.remove();
    setTokens(next);
  }, [mode]);

  return tokens;
}

interface ThemePreviewProps {
  title: string;
  style: CSSProperties;
}

function ThemePreview({ title, style }: ThemePreviewProps) {
  return (
    <div style={style} className="space-y-3">
      <p className="text-chrome font-semibold text-muted-foreground">{title}</p>
      <div className="rounded-2xl bg-theme p-3">
        <div className="rounded-xl bg-canvas p-5 shadow-sm space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge>Stable</Badge>
            <Badge tone="success">Synced</Badge>
            <Badge tone="warning">Latency 120ms</Badge>
            <Badge tone="info">Streaming</Badge>
            <Badge tone="ai">AI Ready</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-chrome font-semibold text-foreground">Session health</p>
                    <p className="text-fine text-muted-foreground">All checks passing.</p>
                  </div>
                  <StatusDot tone="success" aria-label="Healthy" />
                </div>
                <ThinkingBar />
              </div>
            </Card>

            <Card tone="subtle">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusDot tone="warning" aria-label="Pending" />
                  <p className="text-chrome font-semibold text-foreground">Approvals</p>
                </div>
                <p className="text-content text-muted-foreground">
                  Three approvals queued for review.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm">Review</Button>
                  <Button variant="ghost" size="sm">
                    Snooze
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-surface-1/70 p-4 space-y-3">
              <p className="text-fine font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Centered capsule
              </p>
              <div className="grid place-items-center">
                <InputCapsule
                  position="center"
                  ariaLabel="Centered command input"
                  autoFocus={false}
                  placeholder="Ask anything..."
                />
              </div>
            </div>
            <div className="rounded-xl bg-surface-1/70 p-4 space-y-3">
              <p className="text-fine font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Docked capsule
              </p>
              <div className="relative h-28 rounded-lg bg-surface-2/70">
                <InputCapsule
                  position="dock"
                  ariaLabel="Docked command input"
                  autoFocus={false}
                  placeholder="Continue the thread..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPreview() {
  const [model, setModel] = useState(getDefaultModelId());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(SAMPLE_CHAT_MESSAGES);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nextIdRef = useRef(0);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    const timestamp = Date.now();
    const userMessage: Message = {
      id: `foundation-msg-${nextIdRef.current}`,
      role: "user",
      content: trimmed,
      createdAt: timestamp,
      status: "done",
    };
    nextIdRef.current += 1;
    const assistantMessage: Message = {
      id: `foundation-msg-${nextIdRef.current}`,
      role: "assistant",
      content: "Got it. I will turn that into a recap with actions.",
      createdAt: timestamp + 1,
      status: "done",
    };
    nextIdRef.current += 1;
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
  };

  const handleClear = () => {
    setMessages([]);
  };

  const handleCopyText = (content: string) => {
    if (!content || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(content);
  };

  const handleCopyLast = () => {
    const last = messages[messages.length - 1];
    if (last?.content) {
      handleCopyText(last.content);
    }
  };

  const handleQuote = (content: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${content}` : content));
  };

  const handleEdit = (id: string) => {
    const target = messages.find((message) => message.id === id);
    if (!target) {
      return;
    }
    setInput(target.content);
  };

  const handleBranch = (id: string) => {
    const target = messages.find((message) => message.id === id);
    if (!target) {
      return;
    }
    setInput(`Follow-up: ${target.content}`);
  };

  const handleRetry = (id: string) => {
    const target = messages.find((message) => message.id === id);
    if (!target || target.role === "user") {
      return;
    }
    setInput(target.content);
  };

  const handleAddAttachment = () => {
    fileInputRef.current?.click();
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-surface-1/70 p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-fine font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Chat Components
          </p>
          <h2 className="text-2xl font-semibold text-foreground">Conversation Panel</h2>
          <p className="text-content text-muted-foreground">
            Shell chat UI wired for message list, model picker, and input.
          </p>
        </div>
        <Badge tone="ai">Preview</Badge>
      </div>

      <div className="mt-6 h-[560px] rounded-2xl border border-border/60 bg-surface-0/90">
        <AIPanel
          showHeader
          title={CHAT_TRANSLATIONS.title}
          model={model}
          setModel={setModel}
          models={MODEL_CATALOG}
          onSelectModel={setModel}
          filteredModels={MODEL_CATALOG}
          isStreaming={false}
          isLoading={false}
          onClose={() => undefined}
          showClose={false}
          onClear={handleClear}
          onCopyLast={handleCopyLast}
          onExport={() => undefined}
          headerTranslations={CHAT_TRANSLATIONS}
          panelPosition="main"
          messages={messages}
          suggestions={CHAT_SUGGESTIONS}
          listRef={listRef}
          onEdit={handleEdit}
          onBranch={handleBranch}
          onQuote={handleQuote}
          onCopy={handleCopyText}
          onRetry={handleRetry}
          onSuggestionClick={setInput}
          messageListTranslations={CHAT_TRANSLATIONS}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onRunBackground={() => undefined}
          onAbort={() => undefined}
          attachments={[]}
          onAddAttachment={handleAddAttachment}
          onRemoveAttachment={() => undefined}
          fileInputRef={fileInputRef}
          inputRef={inputRef}
          onFileChange={() => undefined}
          inputTranslations={CHAT_TRANSLATIONS}
          isAttachmentBusy={false}
        />
      </div>
    </section>
  );
}

export function FoundationRoute() {
  const lightThemeTokens = useThemeTokens("light");
  const darkThemeTokens = useThemeTokens("dark");

  return (
    <div className="page-grid">
      <section className="rounded-2xl border border-border/70 bg-linear-to-br from-surface-1 via-surface-0 to-surface-2 p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-fine font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              Tuesday Morning Foundation
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Arc frame, Dia capsule, AI-only novelty.
            </h1>
            <p className="text-content text-muted-foreground">
              Structural shell and primitives ready for parallel feature tracks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="magic">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ask AI
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ThemePreview title="Light Mode" style={lightThemeTokens} />
        <ThemePreview title="Dark Mode" style={darkThemeTokens} />
      </section>

      <ChatPreview />
    </div>
  );
}
