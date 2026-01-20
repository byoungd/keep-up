import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GymFixtureFile } from "../types";

export function resolveWorkspacePath(workspacePath: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  return path.join(workspacePath, targetPath);
}

export async function writeFixtures(
  workspacePath: string,
  fixtures: GymFixtureFile[]
): Promise<void> {
  for (const fixture of fixtures) {
    const absolutePath = resolveWorkspacePath(workspacePath, fixture.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, fixture.content, "utf-8");
  }
}

export async function cleanupWorkspace(workspacePath: string): Promise<void> {
  await rm(workspacePath, { recursive: true, force: true });
}
