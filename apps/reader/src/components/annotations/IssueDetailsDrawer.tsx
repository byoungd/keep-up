"use client";

import {
  IssueActionButtons,
  type IssueActionHandlers,
} from "@/components/issues/IssueActionButtons";
import type { IssueDefinition } from "@/lib/issues/issues";

export type IssueDetailsDrawerProps = {
  issue: IssueDefinition | null;
  actions?: IssueActionHandlers;
};

export function IssueDetailsDrawer({ issue, actions }: IssueDetailsDrawerProps) {
  if (!issue) {
    return null;
  }

  return (
    <details className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs">
      <summary className="cursor-pointer text-[11px] font-semibold text-foreground/80">
        Issue details
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <div>
          <p className="text-[11px] font-semibold text-foreground/80">What happened</p>
          <p className="leading-relaxed">{issue.summary}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-foreground/80">Cause</p>
          <p className="leading-relaxed">{issue.cause}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-foreground/80">Recommended</p>
          <p className="leading-relaxed">{issue.action}</p>
        </div>
        <IssueActionButtons issue={issue} handlers={actions ?? {}} className="pt-1" />
      </div>
    </details>
  );
}
