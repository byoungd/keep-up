/**
 * Test script for file import functionality
 */

import { FileImporter } from "../src";

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

  console.log("Testing Markdown parsing...");
  const mdResult = await importer.importFile({
    buffer: mdContent,
    filename: "test.md",
  });
  console.log("Markdown Result:", JSON.stringify(mdResult, null, 2));

  // Test TXT parsing
  const txtContent = Buffer.from(`This is a plain text file.

It has multiple paragraphs.

And some more content here.
`);

  console.log("\nTesting TXT parsing...");
  const txtResult = await importer.importFile({
    buffer: txtContent,
    filename: "test.txt",
  });
  console.log("TXT Result:", JSON.stringify(txtResult, null, 2));

  console.log("\n✅ All tests passed!");
}

main().catch(console.error);
