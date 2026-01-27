import type { ClarificationRequest } from "@ku0/agent-runtime";
import { type ComponentProps, useMemo, useState } from "react";
import { Badge } from "../../../components/ui/Badge";

type ClarificationAnswerInput = {
  requestId: string;
  answer: string;
  selectedOption?: number;
};

interface ClarificationPanelProps {
  clarifications: ClarificationRequest[];
  onAnswer: (input: ClarificationAnswerInput) => Promise<void>;
}

type PriorityMeta = {
  label: string;
  tone: ComponentProps<typeof Badge>["tone"];
};

function resolvePriority(priority?: ClarificationRequest["priority"]): PriorityMeta | null {
  switch (priority) {
    case "blocking":
      return { label: "Blocking", tone: "error" };
    case "high":
      return { label: "High", tone: "warning" };
    case "medium":
      return { label: "Medium", tone: "info" };
    case "low":
      return { label: "Low", tone: "default" };
    default:
      return null;
  }
}

function priorityWeight(priority?: ClarificationRequest["priority"]): number {
  switch (priority) {
    case "blocking":
      return 3;
    case "high":
      return 2;
    case "medium":
      return 1;
    case "low":
      return 0;
    default:
      return 0;
  }
}

function ClarificationCard({
  request,
  onAnswer,
}: {
  request: ClarificationRequest;
  onAnswer: (input: ClarificationAnswerInput) => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<number | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const priorityMeta = resolvePriority(request.priority);

  const relatedFiles = request.context?.relatedFiles?.filter(Boolean) ?? [];
  const trimmedFiles = relatedFiles.slice(0, 3);

  const handleOptionSelect = (option: string, index: number) => {
    setAnswer(option);
    setSelectedOption(index);
  };

  const handleAnswerChange = (value: string) => {
    setAnswer(value);
    if (
      selectedOption !== undefined &&
      request.options?.[selectedOption] &&
      request.options[selectedOption] !== value
    ) {
      setSelectedOption(undefined);
    }
  };

  const handleSubmit = async () => {
    const trimmed = answer.trim();
    if (!trimmed || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onAnswer({ requestId: request.id, answer: trimmed, selectedOption });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="rounded-2xl border border-border/40 bg-surface-1/80 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-micro font-black uppercase tracking-[0.22em] text-muted-foreground/60">
            Clarification
          </p>
          <h3 className="text-sm font-semibold text-foreground">{request.question}</h3>
        </div>
        {priorityMeta && <Badge tone={priorityMeta.tone}>{priorityMeta.label}</Badge>}
      </div>

      {(request.context?.taskId || trimmedFiles.length > 0) && (
        <div className="space-y-2 text-xs text-muted-foreground">
          {request.context?.taskId && (
            <div>
              <span className="font-semibold text-foreground/80">Task</span>{" "}
              <span className="font-mono">{request.context.taskId.slice(0, 8)}</span>
            </div>
          )}
          {trimmedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {trimmedFiles.map((file) => (
                <span
                  key={file}
                  className="rounded-full border border-border/40 bg-surface-2/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                  title={file}
                >
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {request.context?.codeSnippet && (
        <pre
          className="text-[11px] leading-relaxed bg-surface-0/70 border border-border/40 rounded-xl p-3 max-h-40 overflow-auto text-foreground/80"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
          tabIndex={0}
        >
          {request.context.codeSnippet}
        </pre>
      )}

      {request.options && request.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {request.options.map((option, index) => {
            const isActive = selectedOption === index;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleOptionSelect(option, index)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-fast border ${
                  isActive
                    ? "bg-foreground text-background border-foreground"
                    : "bg-surface-2/70 text-foreground border-border/40 hover:bg-surface-2"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          id={`clarification-${request.id}`}
          aria-label="Clarification answer"
          className="text-input min-h-20 resize-none"
          placeholder="Share your answer..."
          value={answer}
          onChange={(event) => handleAnswerChange(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={answer.trim().length === 0 || isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send answer"}
          </button>
          {request.continueWorkWhileWaiting && (
            <span className="text-xs text-muted-foreground">Agent is working while waiting.</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function ClarificationPanel({ clarifications, onAnswer }: ClarificationPanelProps) {
  const ordered = useMemo(() => {
    return [...clarifications].sort(
      (a, b) => priorityWeight(b.priority) - priorityWeight(a.priority)
    );
  }, [clarifications]);

  if (ordered.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 p-4 border-b border-border/40">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">
          Clarifications
        </h2>
        <span className="text-xs text-muted-foreground">{ordered.length} pending</span>
      </div>
      <div className="space-y-3">
        {ordered.map((request) => (
          <ClarificationCard key={request.id} request={request} onAnswer={onAnswer} />
        ))}
      </div>
    </section>
  );
}
