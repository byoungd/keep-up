/**
 * Test URL import with public files
 */

import { FileImporter } from "../src";

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

// Public test files
const TEST_URLS = {
  // GitHub raw markdown files
  markdown: "https://raw.githubusercontent.com/microsoft/TypeScript/main/README.md",

  // Plain text file - Alice in Wonderland
  txt: "https://www.gutenberg.org/files/11/11-0.txt",

  // PDF - Mozilla PDF.js sample
  pdf: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
};

async function testMarkdown() {
  writeLine("\n📝 Testing Markdown import from GitHub...");
  const importer = new FileImporter();

  try {
    const result = await importer.importFromUrl(TEST_URLS.markdown);
    writeLine("✅ Markdown import successful!");
    writeLine(`   Title: ${result.title}`);
    writeLine(`   Content length: ${result.content.length} chars`);
    writeLine(`   SourceId: ${result.sourceId}`);
    writeLine(`   Preview: ${result.content.slice(0, 200)}...`);
  } catch (error) {
    writeErrorLine(`❌ Markdown import failed: ${formatError(error)}`);
  }
}

async function testTxt() {
  writeLine("\n📄 Testing TXT import from Project Gutenberg...");
  const importer = new FileImporter();

  try {
    const result = await importer.importFromUrl(TEST_URLS.txt, {
      maxFileSize: 10 * 1024 * 1024,
    });
    writeLine("✅ TXT import successful!");
    writeLine(`   Title: ${result.title}`);
    writeLine(`   Content length: ${result.content.length} chars`);
    writeLine(`   Preview: ${result.content.slice(0, 300)}...`);
  } catch (error) {
    writeErrorLine(`❌ TXT import failed: ${formatError(error)}`);
  }
}

async function testPdf() {
  writeLine("\n📕 Testing PDF import from Mozilla PDF.js...");
  const importer = new FileImporter();

  try {
    const result = await importer.importFromUrl(TEST_URLS.pdf, {
      timeout: 60000, // PDF might be larger
    });
    writeLine("✅ PDF import successful!");
    writeLine(`   Title: ${result.title}`);
    writeLine(`   Content length: ${result.content.length} chars`);
    writeLine(`   Preview: ${result.content.slice(0, 300)}...`);
  } catch (error) {
    writeErrorLine(`❌ PDF import failed: ${formatError(error)}`);
  }
}

async function main() {
  writeLine("🚀 Testing URL Import Feature\n");
  writeLine("=".repeat(50));

  await testMarkdown();
  await testTxt();
  await testPdf();

  writeLine(`\n${"=".repeat(50)}`);
  writeLine("✨ All tests completed!");
}

main().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
});
