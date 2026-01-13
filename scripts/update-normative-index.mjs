#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const indexPath = process.argv[2] ?? "docs/specs/engineering/99_Normative_Index.md";
const resolvedIndexPath = path.resolve(process.cwd(), indexPath);
const baseDir = path.dirname(resolvedIndexPath);

const text = fs.readFileSync(resolvedIndexPath, "utf8");
const lines = text.split(/\r?\n/);

const replaceMap = new Map([
  ["\u2010", "-"],
  ["\u2011", "-"],
  ["\u2012", "-"],
  ["\u2013", "-"],
  ["\u2014", "-"],
  ["\u2212", "-"],
  ["\u00ad", "-"],
  ["\u00a0", " "],
  ["\u2007", " "],
  ["\u202f", " "],
  ["\u2192", "->"],
]);

const normalize = (value) => {
  let output = value;
  for (const [from, to] of replaceMap.entries()) {
    output = output.split(from).join(to);
  }
  return output;
};

const normalizeLoose = (value) => {
  let output = normalize(value);
  output = output.replace(/[`*_]/g, "");
  output = output.replace(/\s+/g, " ").trim();
  return output;
};

const sourceCache = new Map();
const sourceCacheNorm = new Map();

const loadSource = (filePath) => {
  if (!sourceCache.has(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    const srcLines = content.split(/\r?\n/);
    sourceCache.set(filePath, srcLines);
    sourceCacheNorm.set(
      filePath,
      srcLines.map((line) => normalize(line))
    );
  }
  return {
    lines: sourceCache.get(filePath),
    linesNorm: sourceCacheNorm.get(filePath),
  };
};

let updated = 0;
const notFound = [];
const multipleMatches = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line.startsWith("- REQ-")) {
    continue;
  }

  const sourceIndex = line.lastIndexOf(" (Source: ");
  if (sourceIndex === -1) {
    continue;
  }

  const prefix = line.slice(0, sourceIndex);
  const sourcePart = line.slice(sourceIndex);

  const reqMatch = prefix.match(/^- REQ-\d+:\s*(.*)$/);
  if (!reqMatch) {
    continue;
  }
  const reqText = reqMatch[1];

  const sourceMatch = sourcePart.match(/\(Source: \[[^\]]+\]\(([^)#]+)(#[^)]+)?\), line (\d+)\)/);
  if (!sourceMatch) {
    continue;
  }

  const relPath = sourceMatch[1];
  const sourcePath = path.resolve(baseDir, relPath);
  if (!fs.existsSync(sourcePath)) {
    notFound.push(`${line} -> missing ${sourcePath}`);
    continue;
  }

  const { lines: srcLines, linesNorm } = loadSource(sourcePath);
  const target = normalize(reqText);

  const matches = [];
  for (let lineNum = 0; lineNum < linesNorm.length; lineNum += 1) {
    if (target && linesNorm[lineNum].includes(target)) {
      matches.push(lineNum + 1);
    }
  }

  let foundLine = null;
  if (matches.length === 1) {
    foundLine = matches[0];
  } else if (matches.length > 1) {
    multipleMatches.push(
      `${line} -> multiple matches in ${relPath}: ${matches.slice(0, 5).join(", ")}`
    );
    foundLine = matches[0];
  } else {
    const targetLoose = normalizeLoose(reqText);
    for (let lineNum = 0; lineNum < srcLines.length; lineNum += 1) {
      if (targetLoose && normalizeLoose(srcLines[lineNum]).includes(targetLoose)) {
        foundLine = lineNum + 1;
        break;
      }
    }
  }

  if (foundLine === null) {
    notFound.push(line);
    continue;
  }

  const newSourcePart = sourcePart.replace(/line \d+\)/, `line ${foundLine})`);
  const newLine = `${prefix}${newSourcePart}`;
  if (newLine !== line) {
    lines[i] = newLine;
    updated += 1;
  }
}

if (notFound.length > 0) {
  console.warn(`WARN: Unmatched entries: ${notFound.length}`);
  for (const item of notFound.slice(0, 10)) {
    console.warn(`  ${item}`);
  }
}

if (multipleMatches.length > 0) {
  console.warn(`WARN: Multiple matches: ${multipleMatches.length}`);
  for (const item of multipleMatches.slice(0, 5)) {
    console.warn(`  ${item}`);
  }
}

const newText = lines.join("\n") + (text.endsWith("\n") ? "\n" : "");
fs.writeFileSync(resolvedIndexPath, newText, "utf8");
console.log(`Updated ${updated} line references.`);
