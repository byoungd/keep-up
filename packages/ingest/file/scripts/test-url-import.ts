/**
 * Test URL import with public files
 */

import { FileImporter } from "../src";

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
  console.log("\n📝 Testing Markdown import from GitHub...");
  const importer = new FileImporter();

  try {
    const result = await importer.importFromUrl(TEST_URLS.markdown);
    console.log("✅ Markdown import successful!");
    console.log(`   Title: ${result.title}`);
    console.log(`   Content length: ${result.content.length} chars`);
    console.log(`   SourceId: ${result.sourceId}`);
    console.log(`   Preview: ${result.content.slice(0, 200)}...`);
  } catch (error) {
    console.error("❌ Markdown import failed:", error);
  }
}

async function testTxt() {
  console.log("\n📄 Testing TXT import from Project Gutenberg...");
  const importer = new FileImporter();

  try {
    const result = await importer.importFromUrl(TEST_URLS.txt, {
      maxFileSize: 10 * 1024 * 1024,
    });
    console.log("✅ TXT import successful!");
    console.log(`   Title: ${result.title}`);
    console.log(`   Content length: ${result.content.length} chars`);
    console.log(`   Preview: ${result.content.slice(0, 300)}...`);
  } catch (error) {
    console.error("❌ TXT import failed:", error);
  }
}

async function testPdf() {
  console.log("\n📕 Testing PDF import from Mozilla PDF.js...");
  const importer = new FileImporter();

  try {
    const result = await importer.importFromUrl(TEST_URLS.pdf, {
      timeout: 60000, // PDF might be larger
    });
    console.log("✅ PDF import successful!");
    console.log(`   Title: ${result.title}`);
    console.log(`   Content length: ${result.content.length} chars`);
    console.log(`   Preview: ${result.content.slice(0, 300)}...`);
  } catch (error) {
    console.error("❌ PDF import failed:", error);
  }
}

async function main() {
  console.log("🚀 Testing URL Import Feature\n");
  console.log("=".repeat(50));

  await testMarkdown();
  await testTxt();
  await testPdf();

  console.log(`\n${"=".repeat(50)}`);
  console.log("✨ All tests completed!");
}

main().catch(console.error);
