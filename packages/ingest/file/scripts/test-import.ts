/**
 * Test script for file import functionality
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

async function main() {
  const importer = new FileImporter();

  // Test Markdown parsing
  const mdContent = Buffer.from(`---
title: Test Document
author: Test Author
---

# Hello World

This is a **test** document with some *markdown* content.

## Section 2

- Item 1
- Item 2
- Item 3

Here is some \`inline code\` and a [link](https://example.com).
`);

  writeLine("Testing Markdown parsing...");
  const mdResult = await importer.importFile({
    buffer: mdContent,
    filename: "test.md",
  });
  writeLine(`Markdown Result: ${JSON.stringify(mdResult, null, 2)}`);

  // Test TXT parsing
  const txtContent = Buffer.from(`This is a plain text file.

It has multiple paragraphs.

And some more content here.
`);

  writeLine("\nTesting TXT parsing...");
  const txtResult = await importer.importFile({
    buffer: txtContent,
    filename: "test.txt",
  });
  writeLine(`TXT Result: ${JSON.stringify(txtResult, null, 2)}`);

  writeLine("\n✅ All tests passed!");
}

main().catch((error) => {
  writeErrorLine(`Unhandled error: ${formatError(error)}`);
});
