import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createSkillRegistry } from "../skills/skillRegistry";

const VALID_SKILL = `---
name: demo-skill
description: Demo skill.
---

# Demo
`;

const UPDATED_SKILL = `---
name: demo-skill
description: Updated skill.
---

# Demo
`;

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-registry-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("SkillRegistry", () => {
  it("watches workspace skills for updates", async () => {
    await withTempDir(async (root) => {
      const skillDir = path.join(root, "demo-skill");
      await fs.mkdir(skillDir, { recursive: true });
      const skillFile = path.join(skillDir, "SKILL.md");
      await fs.writeFile(skillFile, VALID_SKILL, "utf-8");

      const registry = createSkillRegistry({
        roots: [{ path: root, source: "user" }],
      });
      await registry.discover();

      let stop = () => undefined;
      const updated = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for skill update"));
        }, 2000);
        stop = registry.watchWorkspaceSkills({
          debounceMs: 0,
          onUpdate: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
        });
      });

      await fs.writeFile(skillFile, UPDATED_SKILL, "utf-8");

      const result = (await updated) as { skills: Array<{ description: string }> };
      stop();

      expect(result.skills[0]?.description).toBe("Updated skill.");
    });
  });
});
