/**
 * Test script using publicly available files from the internet
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

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function testMarkdown() {
  writeLine("\n📝 Testing Markdown (GitHub README)...");

  // Fetch a popular GitHub README
  const url = "https://raw.githubusercontent.com/microsoft/TypeScript/main/README.md";
  const buffer = await fetchBuffer(url);

  const importer = new FileImporter();
  const result = await importer.importFile({
    buffer,
    filename: "README.md",
  });

  writeLine(`Title: ${result.title}`);
  writeLine(`Content length: ${result.content.length} chars`);
  writeLine(`Preview: ${result.content.slice(0, 200)}...`);
  writeLine(`SourceId: ${result.sourceId}`);
}

async function testPDF() {
  writeLine("\n📄 Testing PDF (Sample PDF)...");

  // Use a small public domain PDF
  const url = "https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf";

  try {
    const buffer = await fetchBuffer(url);

    const importer = new FileImporter();
    const result = await importer.importFile({
      buffer,
      filename: "sample.pdf",
    });

    writeLine(`Title: ${result.title}`);
    writeLine(`Content length: ${result.content.length} chars`);
    writeLine(`Preview: ${result.content.slice(0, 200)}...`);
    writeLine(`SourceId: ${result.sourceId}`);
    // biome-ignore lint/suspicious/noExplicitAny: script catch
  } catch (error: any) {
    writeLine(`PDF test error: ${error.message}`);
  }
}

async function testTXT() {
  writeLine("\n📃 Testing TXT (Project Gutenberg)...");

  // Fetch a classic text from Project Gutenberg (Romeo and Juliet excerpt)
  const url = "https://www.gutenberg.org/files/1112/1112-0.txt";

  try {
    const buffer = await fetchBuffer(url);

    const importer = new FileImporter();
    const result = await importer.importFile({
      buffer,
      filename: "romeo-and-juliet.txt",
    });

    writeLine(`Title: ${result.title}`);
    writeLine(`Content length: ${result.content.length} chars`);
    writeLine(`Preview: ${result.content.slice(0, 300)}...`);
    writeLine(`SourceId: ${result.sourceId}`);
    // biome-ignore lint/suspicious/noExplicitAny: script catch
  } catch (error: any) {
    writeLine(`TXT test error: ${error.message}`);
  }
}

async function testEPUB() {
  writeLine("\n📚 Testing EPUB (Standard Ebooks)...");

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

    writeLine(`Title: ${result.title}`);
    writeLine(`Content length: ${result.content.length} chars`);
    writeLine(`Preview: ${result.content.slice(0, 300)}...`);
    writeLine(`SourceId: ${result.sourceId}`);
    // biome-ignore lint/suspicious/noExplicitAny: script catch
  } catch (error: any) {
    writeLine(`EPUB test error: ${error.message}`);
  }
}

async function main() {
  writeLine("🧪 Testing File Import with Remote Files\n");
  writeLine("=".repeat(50));

  await testMarkdown();
  await testPDF();
  await testTXT();
  await testEPUB();

  writeLine(`\n${"=".repeat(50)}`);
  writeLine("✅ Remote file tests completed!");
}

main().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
});
