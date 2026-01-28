import { BarChart3, Code2, PenLine, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { GlassPanel } from "../../components/GlassPanel";
import { cn } from "../../lib/cn";

const AGENT_CATALOG = [
  {
    id: "code-assistant",
    name: "Code Assistant",
    description: "Pair programmer for refactors, migrations, and test coverage.",
    icon: Code2,
    tags: ["coding", "productivity", "review"],
    installed: true,
  },
  {
    id: "linter-guardian",
    name: "Quality Guardian",
    description: "Enforces coding standards, a11y checks, and release gates.",
    icon: ShieldCheck,
    tags: ["quality", "a11y", "compliance"],
    installed: false,
  },
  {
    id: "insight-analyst",
    name: "Insight Analyst",
    description: "Transforms logs and metrics into actionable summaries.",
    icon: BarChart3,
    tags: ["data", "analytics", "insights"],
    installed: false,
  },
  {
    id: "writer",
    name: "Content Writer",
    description: "Drafts release notes, docs, and polished product copy.",
    icon: PenLine,
    tags: ["writing", "docs", "product"],
    installed: false,
  },
  {
    id: "workflow-orchestrator",
    name: "Workflow Orchestrator",
    description: "Automates multi-step routines and background workflows.",
    icon: Sparkles,
    tags: ["automation", "ops", "runtime"],
    installed: false,
  },
  {
    id: "ux-polisher",
    name: "UX Polisher",
    description: "Refines UI copy, spacing, and visual hierarchy.",
    icon: Wand2,
    tags: ["design", "ux", "style"],
    installed: false,
  },
] as const;

type CatalogItem = (typeof AGENT_CATALOG)[number];
type Agent = Omit<CatalogItem, "installed" | "tags"> & {
  installed: boolean;
  tags: readonly string[];
};

type AgentCardProps = {
  agent: Agent;
  onToggle: () => void;
};

function AgentCard({ agent, onToggle }: AgentCardProps) {
  const Icon = agent.icon;

  return (
    <GlassPanel
      className="flex h-full flex-col gap-4 p-5 transition-transform duration-200 ease-out hover:-translate-y-1"
      intensity="medium"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-surface-0/70">
          <Icon className="h-5 w-5 text-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="text-xs text-muted-foreground">{agent.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {agent.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border/50 bg-surface-1/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            agent.installed ? "bg-success/10 text-success" : "bg-surface-1/80 text-muted-foreground"
          )}
        >
          {agent.installed ? "Installed" : "Available"}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            agent.installed
              ? "border border-border/60 bg-surface-1/70 text-muted-foreground hover:border-destructive/60 hover:text-destructive"
              : "text-white"
          )}
          style={
            agent.installed
              ? undefined
              : {
                  background: "var(--gradient-ai)",
                }
          }
          aria-label={agent.installed ? `Remove ${agent.name}` : `Install ${agent.name}`}
        >
          {agent.installed ? "Remove" : "Install"}
        </button>
      </div>
    </GlassPanel>
  );
}

export function MarketRoute() {
  const [agents, setAgents] = useState<Agent[]>([...AGENT_CATALOG]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const agent of agents) {
      for (const tag of agent.tags) {
        tags.add(tag);
      }
    }
    return ["all", ...Array.from(tags).sort()];
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return agents.filter((agent) => {
      const matchesQuery =
        query.length === 0 ||
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query) ||
        agent.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesTag = activeTag === "all" || agent.tags.includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [agents, search, activeTag]);

  const toggleAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, installed: !agent.installed } : agent))
    );
  };

  return (
    <div className="page-grid">
      <GlassPanel
        intensity="strong"
        className="relative overflow-hidden p-8"
        style={{ background: "var(--gradient-premium)" }}
      >
        <div className="relative space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
            Agent Market
          </p>
          <h1 className="text-3xl font-semibold text-white">Discover premium agents</h1>
          <p className="max-w-2xl text-sm text-white/80">
            Curated agents for coding, analytics, and collaboration. Install the ones you need and
            tailor each session to the right expertise.
          </p>
        </div>
      </GlassPanel>

      <section className="card-panel space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Browse agents</p>
            <p className="text-xs text-muted-foreground">
              Filter by capability, install instantly, and keep your toolbox sharp.
            </p>
          </div>
          <input
            type="text"
            aria-label="Search agents"
            placeholder="Search agents..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="text-input w-full lg:max-w-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                tag === activeTag
                  ? "border-foreground/50 bg-foreground/5 text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              )}
              aria-pressed={tag === activeTag}
            >
              {tag === "all" ? "All" : tag}
            </button>
          ))}
        </div>
      </section>

      {filteredAgents.length === 0 ? (
        <div className="card-panel text-sm text-muted-foreground">
          No agents match your search. Try a different keyword or tag.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onToggle={() => toggleAgent(agent.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
