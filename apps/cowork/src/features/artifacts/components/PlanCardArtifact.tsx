import type { ArtifactPayload } from "../../tasks/types";

type PlanCardArtifactPayload = Extract<ArtifactPayload, { type: "PlanCard" }>;

interface PlanCardArtifactProps {
  payload: PlanCardArtifactPayload;
}

const STATUS_LABELS: Record<
  NonNullable<PlanCardArtifactPayload["steps"][number]["status"]>,
  string
> = {
  pending: "Pending",
  running: "Running",
  blocked: "Blocked",
  completed: "Completed",
  failed: "Failed",
};

export function PlanCardArtifact({ payload }: PlanCardArtifactProps) {
  const completedCount = payload.steps.filter((step) => step.status === "completed").length;
  const totalSteps = payload.steps.length;
  const progress = totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
            Plan
          </div>
          <h3 className="text-sm font-semibold text-foreground">{payload.goal}</h3>
          {payload.summary && <p className="text-xs text-muted-foreground">{payload.summary}</p>}
        </div>
        <div className="text-xs font-semibold text-muted-foreground bg-surface-2 px-2 py-1 rounded-full">
          {progress}% Complete
        </div>
      </div>

      <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-info transition-all duration-500 ease-in-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-3">
        {payload.steps.map((step, index) => {
          const status = step.status ?? "pending";
          return (
            <div key={`${step.title}-${index}`} className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center ${
                  status === "completed"
                    ? "bg-info border-info"
                    : status === "failed"
                      ? "bg-error/10 border-error/40"
                      : status === "blocked"
                        ? "bg-warning/10 border-warning/40"
                        : "border-border"
                }`}
              >
                {status === "completed" ? (
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <title>Completed step</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : status === "running" ? (
                  <span className="h-2 w-2 rounded-full bg-info animate-pulse" />
                ) : null}
              </div>
              <div className="flex-1">
                <div className="text-sm text-foreground">{step.title}</div>
                <div className="text-micro text-muted-foreground/60">{STATUS_LABELS[status]}</div>
              </div>
            </div>
          );
        })}
      </div>

      {payload.files && payload.files.length > 0 && (
        <div className="pt-2 border-t border-border/60 space-y-2">
          <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
            Files
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {payload.files.map((file) => (
              <li key={file} className="truncate">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
