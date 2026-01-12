/**
 * PDF Parsing Quality Evaluation
 */

import { FileImporter } from "../src";

const TEST_PDF = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

async function evaluatePdf() {
  console.log("📊 PDF Parsing Quality Evaluation\n");
  console.log("=".repeat(60));

  const importer = new FileImporter();
  const result = await importer.importFromUrl(TEST_PDF, { timeout: 60000 });

  const content = result.content;
  const lines = content.split("\n");
  const paragraphs = content.split("\n\n").filter((p) => p.trim());

  console.log("\n📈 Basic Metrics:");
  console.log(`   Total characters: ${content.length}`);
  console.log(`   Total lines: ${lines.length}`);
  console.log(`   Total paragraphs: ${paragraphs.length}`);
  console.log(`   Title extracted: "${result.title}"`);

  // Check for common issues
  console.log("\n🔍 Quality Checks:");

  // 1. Check for garbled text (non-printable chars)
  const nonPrintable = content.match(/[^\x20-\x7E\n\r\t]/g) || [];
  const nonPrintableRatio = nonPrintable.length / content.length;
  console.log(
    `   Non-ASCII chars: ${nonPrintable.length} (${(nonPrintableRatio * 100).toFixed(2)}%)`
  );

  // 2. Check for word fragmentation (single char "words")
  const words = content.split(/\s+/).filter((w) => w.length > 0);
  const singleCharWords = words.filter((w) => w.length === 1 && /[a-zA-Z]/.test(w));
  const fragRatio = singleCharWords.length / words.length;
  console.log(
    `   Single-char words: ${singleCharWords.length}/${words.length} (${(fragRatio * 100).toFixed(2)}%)`
  );

  // 3. Check paragraph length distribution
  const avgParagraphLen = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
  const shortParagraphs = paragraphs.filter((p) => p.length < 50).length;
  console.log(`   Avg paragraph length: ${avgParagraphLen.toFixed(0)} chars`);
  console.log(`   Short paragraphs (<50 chars): ${shortParagraphs}/${paragraphs.length}`);

  // 4. Check for common PDF artifacts
  const hasPageNumbers = /\b\d+\s*$/.test(content);
  const hasReferences = /\[\d+\]/.test(content) || /\(\d{4}\)/.test(content);
  console.log(`   Contains page numbers: ${hasPageNumbers ? "likely" : "no"}`);
  console.log(`   Contains references: ${hasReferences ? "yes" : "no"}`);

  // 5. Sample content preview
  console.log("\n📝 Content Samples:");
  console.log("\n   First 500 chars:");
  console.log(`   ${content.slice(0, 500).replace(/\n/g, "\n   ")}`);

  console.log("\n   Middle section (chars 40000-40500):");
  console.log(`   ${content.slice(40000, 40500).replace(/\n/g, "\n   ")}`);

  // Quality score (simple heuristic)
  console.log("\n📊 Quality Score:");
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

  console.log(`   Estimated quality: ${Math.max(0, score)}/100`);

  if (score >= 80) {
    console.log("   ✅ Good quality - suitable for reading");
  } else if (score >= 60) {
    console.log("   ⚠️ Acceptable - some issues present");
  } else {
    console.log("   ❌ Poor quality - may need alternative parser");
  }

  console.log(`\n${"=".repeat(60)}`);
}

evaluatePdf().catch(console.error);
