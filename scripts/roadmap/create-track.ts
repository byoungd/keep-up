import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

interface CliOptions {
  id: string;
  title: string;
  priority: string;
  status: string;
  owner: string;
  dependencies: string;
  source: string;
  phase?: string;
  out?: string;
  force: boolean;
}

const DEFAULTS = {
  priority: "P1",
  status: "Proposed",
  owner: "Agent Runtime Team",
  dependencies: "None",
  source: "docs/roadmap/README.md",
};

const TEMPLATE_PATH = "docs/roadmap/track-template.md";

function printUsage(): void {
  // Keep usage short for CLI readability.
  console.log(`Usage:
  pnpm roadmap:new-track -- --id AV --title "Cognition Delivery" --phase phase-9-convergence \\
    [--priority P0] [--status Proposed] [--owner "Agent Runtime Team"] \\
    [--deps "Phase 3 Graph Runtime"] [--source "docs/roadmap/phase-4-cognition/README.md"] \\
    [--out "docs/roadmap/phase-9-convergence/track-av-cognition-delivery.md"] [--force]
`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function parseArgs(argv: string[]): CliOptions | null {
  const opts: CliOptions = {
    id: "",
    title: "",
    priority: DEFAULTS.priority,
    status: DEFAULTS.status,
    owner: DEFAULTS.owner,
    dependencies: DEFAULTS.dependencies,
    source: DEFAULTS.source,
    phase: undefined,
    out: undefined,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    if (key === "force") {
      opts.force = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      console.error(`Missing value for --${key}`);
      return null;
    }
    i += 1;

    switch (key) {
      case "id":
        opts.id = value;
        break;
      case "title":
        opts.title = value;
        break;
      case "priority":
        opts.priority = value;
        break;
      case "status":
        opts.status = value;
        break;
      case "owner":
        opts.owner = value;
        break;
      case "deps":
      case "dependencies":
        opts.dependencies = value;
        break;
      case "source":
        opts.source = value;
        break;
      case "phase":
        opts.phase = value;
        break;
      case "out":
        opts.out = value;
        break;
      default:
        console.error(`Unknown option: --${key}`);
        return null;
    }
  }

  if (!opts.id || !opts.title) {
    console.error("--id and --title are required");
    return null;
  }

  if (!opts.out && !opts.phase) {
    console.error("Provide --phase or --out");
    return null;
  }

  return opts;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildOutputPath(opts: CliOptions): string {
  if (opts.out) {
    return opts.out;
  }
  const idLower = opts.id.toLowerCase();
  const slug = slugify(opts.title);
  const fileName = `track-${idLower}-${slug}.md`;
  return path.join("docs/roadmap", opts.phase ?? "", fileName);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    printUsage();
    process.exit(1);
  }

  const template = await readFile(TEMPLATE_PATH, "utf8");
  const outputPath = buildOutputPath(opts);

  if (!opts.force && (await fileExists(outputPath))) {
    console.error(`File already exists: ${outputPath}`);
    process.exit(1);
  }

  const filled = template
    .replaceAll("<ID>", opts.id)
    .replaceAll("<Title>", opts.title)
    .replaceAll("<P0|P1|P2|P3>", opts.priority)
    .replaceAll("<Proposed|Ready|Approved|Active|Completed>", opts.status)
    .replaceAll("<Team/Owner>", opts.owner)
    .replaceAll("<List key dependencies>", opts.dependencies)
    .replaceAll("<Link to roadmap phase or related spec>", opts.source);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, filled, "utf8");
  console.log(`Created ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
