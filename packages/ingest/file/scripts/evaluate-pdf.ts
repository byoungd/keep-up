/**
 * PDF Parsing Quality Evaluation
 */

import { FileImporter } from "../src";

const TEST_PDF = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

function writeLine(line: string): void {
  process.stdout.write(line.endsWith("\n") ? line : `${line}\n`);
}

function writeErrorLine(line: string): void {
  process.stderr.write(line.endsWith("\n") ? line : `${line}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

async function evaluatePdf() {
  writeLine("📊 PDF Parsing Quality Evaluation\n");
  writeLine("=".repeat(60));

  const importer = new FileImporter();
  const result = await importer.importFromUrl(TEST_PDF, { timeout: 60000 });

  const content = result.content;
  const lines = content.split("\n");
  const paragraphs = content.split("\n\n").filter((p) => p.trim());

  writeLine("\n📈 Basic Metrics:");
  writeLine(`   Total characters: ${content.length}`);
  writeLine(`   Total lines: ${lines.length}`);
  writeLine(`   Total paragraphs: ${paragraphs.length}`);
  writeLine(`   Title extracted: "${result.title}"`);

  // Check for common issues
  writeLine("\n🔍 Quality Checks:");

  // 1. Check for garbled text (non-printable chars)
  const nonPrintable = content.match(/[^\x20-\x7E\n\r\t]/g) || [];
  const nonPrintableRatio = nonPrintable.length / content.length;
  writeLine(
    `   Non-ASCII chars: ${nonPrintable.length} (${(nonPrintableRatio * 100).toFixed(2)}%)`
  );

  // 2. Check for word fragmentation (single char "words")
  const words = content.split(/\s+/).filter((w) => w.length > 0);
  const singleCharWords = words.filter((w) => w.length === 1 && /[a-zA-Z]/.test(w));
  const fragRatio = singleCharWords.length / words.length;
  writeLine(
    `   Single-char words: ${singleCharWords.length}/${words.length} (${(fragRatio * 100).toFixed(2)}%)`
  );

  // 3. Check paragraph length distribution
  const avgParagraphLen = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
  const shortParagraphs = paragraphs.filter((p) => p.length < 50).length;
  writeLine(`   Avg paragraph length: ${avgParagraphLen.toFixed(0)} chars`);
  writeLine(`   Short paragraphs (<50 chars): ${shortParagraphs}/${paragraphs.length}`);

  // 4. Check for common PDF artifacts
  const hasPageNumbers = /\b\d+\s*$/.test(content);
  const hasReferences = /\[\d+\]/.test(content) || /\(\d{4}\)/.test(content);
  writeLine(`   Contains page numbers: ${hasPageNumbers ? "likely" : "no"}`);
  writeLine(`   Contains references: ${hasReferences ? "yes" : "no"}`);

  // 5. Sample content preview
  writeLine("\n📝 Content Samples:");
  writeLine("\n   First 500 chars:");
  writeLine(`   ${content.slice(0, 500).replace(/\n/g, "\n   ")}`);

  writeLine("\n   Middle section (chars 40000-40500):");
  writeLine(`   ${content.slice(40000, 40500).replace(/\n/g, "\n   ")}`);

  // Quality score (simple heuristic)
  writeLine("\n📊 Quality Score:");
  let score = 100;
  if (nonPrintableRatio > 0.05) {
    score -= 20;
  }
  if (fragRatio > 0.1) {
    score -= 30;
  }
  if (avgParagraphLen < 100) {
    score -= 15;
  }
  if (shortParagraphs / paragraphs.length > 0.5) {
    score -= 15;
  }

  writeLine(`   Estimated quality: ${Math.max(0, score)}/100`);

  if (score >= 80) {
    writeLine("   ✅ Good quality - suitable for reading");
  } else if (score >= 60) {
    writeLine("   ⚠️ Acceptable - some issues present");
  } else {
    writeLine("   ❌ Poor quality - may need alternative parser");
  }

  writeLine(`\n${"=".repeat(60)}`);
}

evaluatePdf().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
});
