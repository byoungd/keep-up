import type { ArtifactPayload } from "../../tasks/types";

type ChecklistCardPayload = Extract<ArtifactPayload, { type: "ChecklistCard" }>;

interface ChecklistCardProps {
  payload: ChecklistCardPayload;
}

export function ChecklistCard({ payload }: ChecklistCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
          Checklist
        </div>
        <h3 className="text-sm font-semibold text-foreground mt-1">
          {payload.title ?? "Checklist"}
        </h3>
      </div>

      <ul className="space-y-2">
        {payload.items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center ${
                item.checked ? "bg-success/20 border-success/50 text-success" : "border-border"
              }`}
              aria-hidden="true"
            >
              {item.checked && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <title>Checked</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </span>
            <span
              className={item.checked ? "text-muted-foreground line-through" : "text-foreground"}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
