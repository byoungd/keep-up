import type { z } from "zod";
import type { PlanStepSchema } from "../../tasks/types";

type PlanStep = z.infer<typeof PlanStepSchema>;

interface PlanCardProps {
  steps: PlanStep[];
}

export function PlanCard({ steps }: PlanCardProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalSteps = steps.length;
  const progress = totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 my-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-info/10 rounded text-info">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <title>Plan icon</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h3 className="font-bold text-foreground text-sm">Action Plan</h3>
        </div>
        <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {progress}% Complete
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-info transition-all duration-500 ease-in-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-3 group">
            <div
              className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors duration-150
               ${step.status === "completed" ? "bg-info border-info" : "border-border group-hover:border-foreground/50"}
             `}
            >
              {step.status === "completed" && (
                <svg
                  className="w-3 h-3 text-primary-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <title>Completed step icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {step.status === "in_progress" && <div className="w-2 h-2 bg-info rounded-full" />}
            </div>
            <span
              className={`text-sm ${step.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
