import { readFile } from "node:fs/promises";
import process from "node:process";

const DEFAULT_BASELINE = "artifacts/perf-baseline.json";
const DEFAULT_METRICS = "artifacts/perf-metrics.json";
const MAX_AVG_REGRESSION = 0.2;
const MIN_OPS_REGRESSION = 0.2;

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function buildIndex(entries) {
  const map = new Map();
  for (const entry of entries ?? []) {
    if (entry?.name) {
      map.set(entry.name, entry);
    }
  }
  return map;
}

function checkAvgRegression(base, metric, failures) {
  if (typeof base.avgMs !== "number" || typeof metric.avgMs !== "number") {
    return;
  }
  const maxAllowed = base.avgMs * (1 + MAX_AVG_REGRESSION);
  if (metric.avgMs > maxAllowed) {
    failures.push(
      `avgMs regression for ${metric.name}: ${metric.avgMs.toFixed(3)}ms > ${maxAllowed.toFixed(3)}ms`
    );
  }
}

function checkOpsRegression(base, metric, failures) {
  if (typeof base.opsPerSec !== "number" || typeof metric.opsPerSec !== "number") {
    return;
  }
  const minAllowed = base.opsPerSec * (1 - MIN_OPS_REGRESSION);
  if (metric.opsPerSec < minAllowed) {
    failures.push(
      `ops/sec regression for ${metric.name}: ${metric.opsPerSec.toFixed(2)} < ${minAllowed.toFixed(2)}`
    );
  }
}

function compareBench(baselineEntries, metricEntries) {
  const baselineMap = buildIndex(baselineEntries);
  const failures = [];

  for (const metric of metricEntries ?? []) {
    const base = baselineMap.get(metric.name);
    if (!base) {
      continue;
    }
    checkAvgRegression(base, metric, failures);
    checkOpsRegression(base, metric, failures);
  }

  return failures;
}

async function main() {
  const baselinePath = getArgValue("--baseline") ?? DEFAULT_BASELINE;
  const metricsPath = getArgValue("--metrics") ?? DEFAULT_METRICS;

  const baseline = await loadJson(baselinePath);
  const metrics = await loadJson(metricsPath);

  const failures = compareBench(baseline?.bench?.cache, metrics?.bench?.cache);

  if (failures.length) {
    process.stderr.write(`${failures.length} perf regression(s) detected:\n`);
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Perf gate passed.\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Perf gate failed: ${message}\n`);
  process.exitCode = 1;
});
