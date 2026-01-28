import type { SkillActivation } from "@ku0/agent-runtime-core";
import type { SkillSummary } from "../../features/tasks/types";

const SOURCE_LABELS: Record<string, string> = {
  builtin: "Bundled",
  org: "Managed",
  user: "Workspace",
  third_party: "Third-party",
};

function resolveSourceLabel(source: string | undefined): string {
  if (!source) {
    return "Unknown";
  }
  return SOURCE_LABELS[source] ?? source;
}

type SkillsPanelProps = {
  skills?: SkillSummary[];
  activeSkills?: SkillActivation[];
  errors?: Array<{ path: string; reason: string }>;
};

export function SkillsPanel({ skills, activeSkills, errors }: SkillsPanelProps) {
  const activeIds = new Set(activeSkills?.map((skill) => skill.skillId) ?? []);
  const sortedSkills = [...(skills ?? [])].sort((a, b) => {
    const aActive = activeIds.has(a.skillId) ? 1 : 0;
    const bActive = activeIds.has(b.skillId) ? 1 : 0;
    return bActive - aActive || a.name.localeCompare(b.name);
  });
  const activeCount = sortedSkills.filter((skill) => activeIds.has(skill.skillId)).length;

  return (
    <section className="border-b border-border/40 bg-surface-0 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">Active Skills</p>
          <p className="text-[11px] text-muted-foreground">
            {sortedSkills.length > 0
              ? `${activeCount} active · ${sortedSkills.length} available`
              : "No skills loaded"}
          </p>
        </div>
      </div>

      {sortedSkills.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add skills in your workspace or managed directories to make them available.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedSkills.map((skill) => {
            const isActive = activeIds.has(skill.skillId);
            const status = skill.disabled ? "Disabled" : isActive ? "Active" : "Available";
            const statusClass = skill.disabled
              ? "bg-destructive/10 text-destructive"
              : isActive
                ? "bg-success/10 text-success"
                : "bg-surface-2 text-muted-foreground";

            return (
              <div
                key={skill.skillId}
                className="rounded-md border border-border/40 bg-surface-1/40 p-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{skill.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass}`}>
                    {status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {skill.description}
                </p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{resolveSourceLabel(skill.source)}</span>
                  <span className="font-mono">{skill.skillId.slice(0, 8)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {errors && errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
          <p className="font-semibold">Skill load errors</p>
          <ul className="mt-1 space-y-1">
            {errors.slice(0, 3).map((error) => (
              <li key={error.path} className="truncate">
                {error.path}: {error.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
