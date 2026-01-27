/**
 * ProcessCodeExecutor Tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { IBashExecutor } from "../tools/core/bash";
import { ProcessCodeExecutor } from "../tools/core/code";

function extractFilePath(command: string): string | undefined {
  const match = command.match(/"([^"]+)"/);
  return match?.[1];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

describe("ProcessCodeExecutor", () => {
  it("creates isolated temp directories per run and cleans them up", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "code-exec-test-"));
    const seenDirs: string[] = [];
    const seenExists: boolean[] = [];

    const bashExecutor: IBashExecutor = {
      execute: async (command) => {
        const filePath = extractFilePath(command);
        if (filePath) {
          seenDirs.push(path.dirname(filePath));
          seenExists.push(await pathExists(filePath));
        }
        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          timedOut: false,
          truncated: false,
          durationMs: 5,
        };
      },
    };

    const executor = new ProcessCodeExecutor({
      bashExecutor,
      tempDir: tempRoot,
    });

    try {
      await executor.execute("python", "print('hi')", {});
      await executor.execute("python", "print('hi')", {});

      expect(seenDirs).toHaveLength(2);
      expect(seenDirs[0]).not.toBe(seenDirs[1]);
      expect(seenExists.every(Boolean)).toBe(true);

      for (const dir of seenDirs) {
        expect(isWithin(tempRoot, dir)).toBe(true);
        expect(await pathExists(dir)).toBe(false);
      }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
