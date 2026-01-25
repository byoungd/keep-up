import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const category = process.argv[2];

if (!category) {
  console.error("Usage: node scripts/run-e2e-category.mjs <category>");
  process.exit(1);
}

const CATEGORY_PATTERNS = {
  core: [/core/i, /editor/i, /selection/i],
  blocks: [/block/i, /nodeview/i, /drag/i],
  collab: [/collab/i, /presence/i, /sync/i],
  annotations: [/annotation/i, /comment/i, /highlight/i],
  features: [/import/i, /ai/i, /gateway/i, /persistence/i, /feature/i],
  smoke: [/smoke/i, /sidebar/i, /navigation/i],
};

const patterns = CATEGORY_PATTERNS[category];

if (!patterns) {
  console.error(`Unknown e2e category: ${category}`);
  process.exit(1);
}

const repoRoot = process.cwd();
const e2eRoot = path.join(repoRoot, "tests", "e2e");
const e2eSrc = path.join(e2eRoot, "src");

if (!fs.existsSync(e2eSrc)) {
  console.error(`Missing e2e source directory: ${e2eSrc}`);
  process.exit(1);
}

const specFiles = collectSpecFiles(e2eSrc);
const matchingSpecs = specFiles.filter((filePath) => {
  const relativePath = path.relative(e2eSrc, filePath);
  return patterns.some((pattern) => pattern.test(relativePath));
});

if (matchingSpecs.length === 0) {
  console.log(`No e2e specs found for category "${category}" under tests/e2e/src. Skipping.`);
  process.exit(0);
}

const args = [
  "--filter",
  "@ku0/e2e-tests",
  "test:e2e",
  "--",
  ...matchingSpecs.map((filePath) => path.relative(e2eRoot, filePath)),
];

const result = spawnSync("pnpm", args, { stdio: "inherit" });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

function collectSpecFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSpecFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".spec.ts") || entry.name.endsWith(".spec.tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}
