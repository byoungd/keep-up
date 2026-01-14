export type ArtifactType = "plan" | "diff" | "checklist" | "report";

export type PlanStep = {
  title: string;
  description?: string;
  status?: "todo" | "doing" | "done";
};

export type DiffFile = {
  path: string;
  diff: string;
};

export type ChecklistItem = {
  text: string;
  checked?: boolean;
};

export type ReportSection = {
  heading: string;
  content: string;
};

type ArtifactBase = {
  id?: string;
  title: string;
  summary?: string;
};

export type Artifact =
  | (ArtifactBase & {
      type: "plan";
      steps: PlanStep[];
    })
  | (ArtifactBase & {
      type: "diff";
      files: DiffFile[];
    })
  | (ArtifactBase & {
      type: "checklist";
      items: ChecklistItem[];
    })
  | (ArtifactBase & {
      type: "report";
      sections: ReportSection[];
    });

type ArtifactParseResult = {
  content: string;
  artifacts: Artifact[];
};

const ARTIFACT_BLOCK_REGEX = /```artifact\s*([\s\S]*?)```/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizePlanStep(value: unknown): PlanStep | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = asString(value.title ?? value.name);
  if (!title) {
    return null;
  }
  const description = asString(value.description ?? value.details) ?? undefined;
  const status = asString(value.status);
  if (status && status !== "todo" && status !== "doing" && status !== "done") {
    return { title, description };
  }
  return { title, description, status: status as PlanStep["status"] };
}

function normalizeDiffFile(value: unknown): DiffFile | null {
  if (!isRecord(value)) {
    return null;
  }
  const path = asString(value.path);
  const diff = asString(value.diff ?? value.patch);
  if (!path || !diff) {
    return null;
  }
  return { path, diff };
}

function normalizeChecklistItem(value: unknown): ChecklistItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const text = asString(value.text ?? value.title);
  if (!text) {
    return null;
  }
  return { text, checked: value.checked === true };
}

function normalizeReportSection(value: unknown): ReportSection | null {
  if (!isRecord(value)) {
    return null;
  }
  const heading = asString(value.heading ?? value.title);
  const content = asString(value.content ?? value.body);
  if (!heading || !content) {
    return null;
  }
  return { heading, content };
}

function normalizeArtifact(parsed: unknown): Artifact | null {
  if (!isRecord(parsed)) {
    return null;
  }
  const type = asString(parsed.type);
  const title = asString(parsed.title ?? parsed.name);
  if (!type || !title) {
    return null;
  }
  const id = asString(parsed.id ?? parsed.artifact_id) ?? undefined;
  const summary = asString(parsed.summary ?? parsed.description) ?? undefined;

  if (type === "plan") {
    const steps = asArray(parsed.steps)
      .map((step) => normalizePlanStep(step))
      .filter((step): step is PlanStep => step !== null);
    return { type, id, title, summary, steps };
  }

  if (type === "diff") {
    const files = asArray(parsed.files)
      .map((file) => normalizeDiffFile(file))
      .filter((file): file is DiffFile => file !== null);
    return { type, id, title, summary, files };
  }

  if (type === "checklist") {
    const items = asArray(parsed.items)
      .map((item) => normalizeChecklistItem(item))
      .filter((item): item is ChecklistItem => item !== null);
    return { type, id, title, summary, items };
  }

  if (type === "report") {
    const sections = asArray(parsed.sections)
      .map((section) => normalizeReportSection(section))
      .filter((section): section is ReportSection => section !== null);
    return { type, id, title, summary, sections };
  }

  return null;
}

export function parseArtifactsFromContent(content: string): ArtifactParseResult {
  if (!content) {
    return { content: "", artifacts: [] };
  }

  const artifacts: Artifact[] = [];
  const matches = content.matchAll(ARTIFACT_BLOCK_REGEX);

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const artifact = normalizeArtifact(parsed);
      if (artifact) {
        artifacts.push(artifact);
      }
    } catch {
      // ignore invalid artifact payloads
    }
  }

  const cleaned = content.replace(ARTIFACT_BLOCK_REGEX, "").trim();
  return { content: cleaned, artifacts };
}
