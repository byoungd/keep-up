export type ToolActivity = "search" | "browse" | "read" | "write" | "run";

const TOOL_ACTIVITY_RULES: Array<{ activity: ToolActivity; tokens: string[] }> = [
  {
    activity: "search",
    tokens: ["search", "query", "find", "lookup", "serp", "tavily", "bing", "google"],
  },
  {
    activity: "browse",
    tokens: ["browse", "browser", "navigate", "crawl", "scrape", "page", "url", "http", "fetch"],
  },
  {
    activity: "read",
    tokens: ["read", "open", "load", "download", "extract", "parse", "ingest"],
  },
  {
    activity: "write",
    tokens: [
      "write",
      "save",
      "create",
      "update",
      "insert",
      "delete",
      "remove",
      "append",
      "edit",
      "patch",
      "replace",
      "apply",
      "upload",
      "persist",
      "store",
    ],
  },
];

const TOOL_ACTIVITY_LABELS: Record<ToolActivity, string> = {
  search: "Searching",
  browse: "Browsing",
  read: "Reading",
  write: "Writing",
  run: "Running",
};

export function resolveToolActivity(toolName: string): ToolActivity {
  const tokens = tokenizeToolName(toolName);
  for (const rule of TOOL_ACTIVITY_RULES) {
    if (rule.tokens.some((token) => tokens.includes(token))) {
      return rule.activity;
    }
  }
  return "run";
}

export function formatToolActivityLabel(activity: ToolActivity): string {
  return TOOL_ACTIVITY_LABELS[activity] ?? TOOL_ACTIVITY_LABELS.run;
}

export function formatToolActivityMessage(
  activity: ToolActivity,
  status: "started" | "completed" | "failed"
): string {
  const label = formatToolActivityLabel(activity);
  switch (status) {
    case "started":
      return `${label}...`;
    case "completed":
      return `${label} complete`;
    case "failed":
      return `${label} failed`;
    default:
      return `${label}...`;
  }
}

function tokenizeToolName(toolName: string): string[] {
  return toolName
    .toLowerCase()
    .split(/[:._/\\-]+/)
    .filter(Boolean);
}
