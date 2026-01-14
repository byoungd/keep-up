"use client";

import type { Artifact } from "@/lib/ai/artifacts";
import { cn } from "@ku0/shared/utils";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileDiff,
  ListChecks,
  NotebookText,
  Route,
} from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

type ReviewState = "approved" | "rejected" | "applied" | null;
type Translator = ReturnType<typeof useTranslations>;

const typeMeta: Record<Artifact["type"], { icon: React.ElementType; key: string }> = {
  plan: { icon: Route, key: "artifactPlanLabel" },
  diff: { icon: FileDiff, key: "artifactDiffLabel" },
  checklist: { icon: ListChecks, key: "artifactChecklistLabel" },
  report: { icon: NotebookText, key: "artifactReportLabel" },
};

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  if (!artifacts.length) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3">
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.id ?? `${artifact.type}-${artifact.title}`}
          artifact={artifact}
        />
      ))}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const t = useTranslations("AIPanel");
  const [expanded, setExpanded] = React.useState(false);
  const [reviewState, setReviewState] = React.useState<ReviewState>(null);

  const meta = typeMeta[artifact.type];
  const Icon = meta.icon;

  const canReview = artifact.type === "diff" || artifact.type === "checklist";
  const canApply = artifact.type === "diff";
  const reviewLabel = getReviewLabel(reviewState, t);

  return (
    <div className="rounded-xl border border-border/50 bg-surface-1/70 p-4 shadow-sm">
      <ArtifactHeader
        artifact={artifact}
        expanded={expanded}
        icon={Icon}
        labelKey={meta.key}
        onToggle={() => setExpanded((prev) => !prev)}
        t={t}
      />

      <ArtifactReviewBadge label={reviewLabel} />

      {expanded && <ArtifactDetails artifact={artifact} t={t} />}

      {canReview && (
        <ArtifactActions
          canApply={canApply}
          onApprove={() => setReviewState("approved")}
          onReject={() => setReviewState("rejected")}
          onApply={() => setReviewState("applied")}
          t={t}
        />
      )}
    </div>
  );
}

function ArtifactHeader({
  artifact,
  expanded,
  icon: Icon,
  labelKey,
  onToggle,
  t,
}: {
  artifact: Artifact;
  expanded: boolean;
  icon: React.ElementType;
  labelKey: string;
  onToggle: () => void;
  t: Translator;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2/70 text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground/70">
            {t("artifactTitle")} · {t(labelKey)}
          </div>
          <div className="text-sm font-semibold text-foreground">{artifact.title}</div>
          {artifact.summary && (
            <div className="text-xs text-muted-foreground/80">{artifact.summary}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
        {expanded ? t("artifactCollapse") : t("artifactExpand")}
      </button>
    </div>
  );
}

function ArtifactReviewBadge({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }

  return (
    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      {label}
    </div>
  );
}

function ArtifactDetails({ artifact, t }: { artifact: Artifact; t: Translator }) {
  if (artifact.type === "plan") {
    return <PlanDetails artifact={artifact} t={t} />;
  }

  if (artifact.type === "diff") {
    return <DiffDetails artifact={artifact} t={t} />;
  }

  if (artifact.type === "checklist") {
    return <ChecklistDetails artifact={artifact} t={t} />;
  }

  return <ReportDetails artifact={artifact} t={t} />;
}

function PlanDetails({
  artifact,
  t,
}: {
  artifact: Extract<Artifact, { type: "plan" }>;
  t: Translator;
}) {
  return (
    <div className="mt-3 space-y-3 text-xs text-muted-foreground/90">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          {t("artifactStepsLabel")}
        </div>
        <div className="space-y-2">
          {artifact.steps.map((step) => (
            <div
              key={`${artifact.title}-${step.title}`}
              className="rounded-lg border border-border/40 bg-surface-2/40 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-foreground">{step.title}</div>
                {step.status && (
                  <span className="rounded-full bg-surface-3/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {step.status}
                  </span>
                )}
              </div>
              {step.description && <div className="mt-1">{step.description}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffDetails({
  artifact,
  t,
}: {
  artifact: Extract<Artifact, { type: "diff" }>;
  t: Translator;
}) {
  return (
    <div className="mt-3 space-y-3 text-xs text-muted-foreground/90">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          {t("artifactFilesLabel")}
        </div>
        {artifact.files.map((file) => (
          <div key={file.path} className="rounded-lg border border-border/40 bg-surface-2/40 p-2">
            <div className="text-[11px] font-medium text-foreground">{file.path}</div>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-3/60 p-2 text-[11px] text-foreground/90">
              {file.diff}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistDetails({
  artifact,
  t,
}: {
  artifact: Extract<Artifact, { type: "checklist" }>;
  t: Translator;
}) {
  return (
    <div className="mt-3 space-y-3 text-xs text-muted-foreground/90">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          {t("artifactChecklistItemsLabel")}
        </div>
        <div className="space-y-2">
          {artifact.items.map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-surface-2/40 px-2 py-1.5"
            >
              <span
                className={cn(
                  "inline-flex h-3 w-3 items-center justify-center rounded-sm border",
                  item.checked ? "border-emerald-500/60 bg-emerald-500/20" : "border-border/60"
                )}
              />
              <span className={cn(item.checked ? "text-foreground" : "text-muted-foreground")}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportDetails({
  artifact,
  t,
}: {
  artifact: Extract<Artifact, { type: "report" }>;
  t: Translator;
}) {
  return (
    <div className="mt-3 space-y-3 text-xs text-muted-foreground/90">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          {t("artifactSectionsLabel")}
        </div>
        <div className="space-y-3">
          {artifact.sections.map((section) => (
            <div
              key={section.heading}
              className="rounded-lg border border-border/40 bg-surface-2/40 p-2"
            >
              <div className="text-[11px] font-medium text-foreground">{section.heading}</div>
              <div className="mt-1 text-muted-foreground/80 whitespace-pre-wrap">
                {section.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtifactActions({
  canApply,
  onApprove,
  onReject,
  onApply,
  t,
}: {
  canApply: boolean;
  onApprove: () => void;
  onReject: () => void;
  onApply: () => void;
  t: Translator;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onApprove}
        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20"
      >
        {t("artifactApprove")}
      </button>
      <button
        type="button"
        onClick={onReject}
        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20"
      >
        {t("artifactReject")}
      </button>
      {canApply && (
        <button
          type="button"
          onClick={onApply}
          className="rounded-md border border-border/50 bg-surface-2/60 px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          {t("artifactApply")}
        </button>
      )}
    </div>
  );
}

function getReviewLabel(state: ReviewState, t: Translator): string | null {
  if (state === "approved") {
    return t("artifactApproved");
  }
  if (state === "rejected") {
    return t("artifactRejected");
  }
  if (state === "applied") {
    return t("artifactApplied");
  }
  return null;
}
