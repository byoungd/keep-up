/**
 * Test script using publicly available files from the internet
 */

import { FileImporter } from "../src";

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function testMarkdown() {
  console.log("\n📝 Testing Markdown (GitHub README)...");

  // Fetch a popular GitHub README
  const url = "https://raw.githubusercontent.com/microsoft/TypeScript/main/README.md";
  const buffer = await fetchBuffer(url);

  const importer = new FileImporter();
  const result = await importer.importFile({
    buffer,
    filename: "README.md",
  });

  console.log("Title:", result.title);
  console.log("Content length:", result.content.length, "chars");
  console.log("Preview:", `${result.content.slice(0, 200)}...`);
  console.log("SourceId:", result.sourceId);
}

async function testPDF() {
  console.log("\n📄 Testing PDF (Sample PDF)...");

  // Use a small public domain PDF
  const url = "https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf";

  try {
    const buffer = await fetchBuffer(url);

    const importer = new FileImporter();
    const result = await importer.importFile({
      buffer,
      filename: "sample.pdf",
    });

    console.log("Title:", result.title);
    console.log("Content length:", result.content.length, "chars");
    console.log("Preview:", `${result.content.slice(0, 200)}...`);
    console.log("SourceId:", result.sourceId);
    // biome-ignore lint/suspicious/noExplicitAny: script catch
  } catch (error: any) {
    console.log("PDF test error:", error.message);
  }
}

async function testTXT() {
  console.log("\n📃 Testing TXT (Project Gutenberg)...");

  // Fetch a classic text from Project Gutenberg (Romeo and Juliet excerpt)
  const url = "https://www.gutenberg.org/files/1112/1112-0.txt";

  try {
    const buffer = await fetchBuffer(url);

    const importer = new FileImporter();
    const result = await importer.importFile({
      buffer,
      filename: "romeo-and-juliet.txt",
    });

    console.log("Title:", result.title);
    console.log("Content length:", result.content.length, "chars");
    console.log("Preview:", `${result.content.slice(0, 300)}...`);
    console.log("SourceId:", result.sourceId);
    // biome-ignore lint/suspicious/noExplicitAny: script catch
  } catch (error: any) {
    console.log("TXT test error:", error.message);
  }
}

async function testEPUB() {
  console.log("\n📚 Testing EPUB (Standard Ebooks)...");

  // Standard Ebooks provides free, well-formatted EPUBs
  // Using a small public domain book
  const url =
    "https://standardebooks.org/ebooks/h-g-wells/the-time-machine/downloads/h-g-wells_the-time-machine.epub";

  try {
    const buffer = await fetchBuffer(url);

    const importer = new FileImporter();
    const result = await importer.importFile({
      buffer,
      filename: "the-time-machine.epub",
    });

    console.log("Title:", result.title);
    console.log("Content length:", result.content.length, "chars");
    console.log("Preview:", `${result.content.slice(0, 300)}...`);
    console.log("SourceId:", result.sourceId);
    // biome-ignore lint/suspicious/noExplicitAny: script catch
  } catch (error: any) {
    console.log("EPUB test error:", error.message);
  }
}

async function main() {
  console.log("🧪 Testing File Import with Remote Files\n");
  console.log("=".repeat(50));

  await testMarkdown();
  await testPDF();
  await testTXT();
  await testEPUB();

  console.log(`\n${"=".repeat(50)}`);
  console.log("✅ Remote file tests completed!");
}

main().catch(console.error);
