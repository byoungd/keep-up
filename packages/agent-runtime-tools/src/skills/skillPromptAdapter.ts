import type { SkillIndexEntry } from "@ku0/agent-runtime-core";

export type SkillPromptOptions = {
  includeLocation?: boolean;
  maxDescriptionLength?: number;
};

export class SkillPromptAdapter {
  private readonly options: SkillPromptOptions;

  constructor(options: SkillPromptOptions = {}) {
    this.options = options;
  }

  formatAvailableSkills(entries: SkillIndexEntry[], options?: SkillPromptOptions): string {
    if (entries.length === 0) {
      return "";
    }

    const merged = { ...this.options, ...options };
    const includeLocation = merged.includeLocation ?? true;
    const maxDescriptionLength = merged.maxDescriptionLength ?? 240;

    const skillsXml = entries
      .map((entry) => this.formatSkill(entry, includeLocation, maxDescriptionLength))
      .join("\n");

    return `<available_skills>\n${skillsXml}\n</available_skills>`;
  }

  private formatSkill(
    entry: SkillIndexEntry,
    includeLocation: boolean,
    maxDescriptionLength: number
  ): string {
    const description = truncate(entry.description, maxDescriptionLength);
    const name = escapeXml(entry.name);
    const desc = escapeXml(description);

    if (!includeLocation) {
      return `  <skill>\n    <name>${name}</name>\n    <description>${desc}</description>\n  </skill>`;
    }

    const location = escapeXml(entry.skillFile ?? entry.path);
    return `  <skill>\n    <name>${name}</name>\n    <description>${desc}</description>\n    <location>${location}</location>\n  </skill>`;
  }
}

export function createSkillPromptAdapter(options?: SkillPromptOptions): SkillPromptAdapter {
  return new SkillPromptAdapter(options);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
