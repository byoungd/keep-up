import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OUTPUT_PATH = "artifacts/perf-baseline.json";

function runBench() {
  const result = spawnSync("pnpm", ["bench:cache"], {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const message = stderr || stdout || "bench:cache failed";
    throw new Error(message);
  }

  return result.stdout ?? "";
}

const BENCH_LINE_PARSERS = [
  { regex: /iterations:\s+(\d+)/, key: "iterations", cast: Number },
  { regex: /avg:\s+([0-9.]+)ms/, key: "avgMs", cast: Number },
  { regex: /ops\/sec:\s+([0-9.]+)/, key: "opsPerSec", cast: Number },
  { regex: /mem Δ:\s+([0-9.]+)MB/, key: "memDeltaMb", cast: Number },
];

function applyBenchLine(line, current) {
  for (const parser of BENCH_LINE_PARSERS) {
    const match = line.match(parser.regex);
    if (match) {
      current[parser.key] = parser.cast(match[1]);
      return;
    }
  }
}

function parseBenchOutput(output) {
  const lines = output.split("\n");
  const results = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("[bench] ")) {
      if (current) {
        results.push(current);
      }
      current = { name: line.replace("[bench] ", "").trim() };
      continue;
    }
    if (!current) {
      continue;
    }
    applyBenchLine(line, current);
  }
  if (current) {
    results.push(current);
  }

  return results;
}

async function main() {
  const output = runBench();
  const cacheBench = parseBenchOutput(output);

  const payload = {
    generatedAt: new Date().toISOString(),
    bench: {
      cache: cacheBench,
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`Baseline written to ${OUTPUT_PATH}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Baseline capture failed: ${message}\n`);
  process.exitCode = 1;
});
