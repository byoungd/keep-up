import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface InstructionOptions {
  cwd?: string;
  override?: string;
}

const DEFAULT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export async function loadProjectInstructions(
  options: InstructionOptions = {}
): Promise<string | undefined> {
  const override = options.override?.trim();
  if (override) {
    return override;
  }

  const cwd = options.cwd ?? process.cwd();
  const contents: string[] = [];

  for (const filename of DEFAULT_FILES) {
    const filePath = path.join(cwd, filename);
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const content = await readFile(filePath, "utf8");
      if (content.trim()) {
        contents.push(`${filename}\n\n${content.trim()}`);
      }
    } catch {
      // Ignore unreadable instructions
    }
  }

  if (contents.length === 0) {
    return undefined;
  }

  return contents.join("\n\n---\n\n");
}
