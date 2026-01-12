/**
 * Export Engine - Main Entry Point
 *
 * Provides a unified API for exporting documents to various formats.
 */

import type { Node as PMNode } from "prosemirror-model";
import { createHtmlSerializer } from "./html";
import { createMarkdownSerializer } from "./markdown";
import type { ExportFormat, ExportOptions, ExportResult, OnProgress } from "./types";

export * from "./types";
export { createMarkdownSerializer } from "./markdown";
export { createHtmlSerializer } from "./html";

/**
 * Export a ProseMirror document to the specified format.
 */
export async function exportDocument(
  doc: PMNode,
  format: ExportFormat,
  options: ExportOptions = {},
  onProgress?: OnProgress
): Promise<ExportResult> {
  onProgress?.({ stage: "preparing", percent: 0, message: "Preparing export..." });

  let result: ExportResult;

  switch (format) {
    case "markdown": {
      onProgress?.({ stage: "serializing", percent: 30, message: "Converting to Markdown..." });
      const serializer = createMarkdownSerializer();
      result = await serializer.serialize(doc, options);
      break;
    }

    case "html": {
      onProgress?.({ stage: "serializing", percent: 30, message: "Converting to HTML..." });
      const serializer = createHtmlSerializer();
      result = await serializer.serialize(doc, options);
      break;
    }

    case "pdf": {
      onProgress?.({ stage: "serializing", percent: 30, message: "Generating PDF..." });
      // PDF export requires browser print API or a library like pdfmake/jspdf
      // For now, we generate HTML and let the user print to PDF
      const htmlSerializer = createHtmlSerializer();
      const htmlResult = await htmlSerializer.serialize(doc, options);

      // Return HTML with print instructions
      result = {
        content: htmlResult.content,
        mimeType: "text/html",
        filename: `${options.title || "document"}.html`,
      };
      break;
    }

    case "docx": {
      onProgress?.({ stage: "serializing", percent: 30, message: "Generating Word document..." });
      // DOCX export would require a library like docx or html-to-docx
      // For now, return HTML that can be opened in Word
      const htmlSerializer = createHtmlSerializer();
      const htmlResult = await htmlSerializer.serialize(doc, options);

      result = {
        content: htmlResult.content,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: `${options.title || "document"}.docx`,
      };
      break;
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  onProgress?.({ stage: "complete", percent: 100, message: "Export complete!" });

  return result;
}

/**
 * Trigger a browser download for the exported content.
 */
export function downloadExport(result: ExportResult): void {
  const blob =
    result.content instanceof Blob
      ? result.content
      : new Blob([result.content], { type: result.mimeType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy exported content to clipboard (for text-based formats).
 */
export async function copyExportToClipboard(result: ExportResult): Promise<boolean> {
  if (result.content instanceof Blob) {
    return false; // Cannot copy binary content
  }

  try {
    await navigator.clipboard.writeText(result.content);
    return true;
  } catch {
    return false;
  }
}
