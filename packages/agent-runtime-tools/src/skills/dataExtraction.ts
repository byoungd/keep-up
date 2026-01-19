/**
 * Data Extraction Skill
 *
 * Tools for extracting structured data from documents and images.
 * Part of Cowork's "Built for Builders" capabilities.
 */

import type { MCPTool } from "@ku0/agent-runtime-core";

/**
 * Result of a data extraction operation.
 */
export interface ExtractionResult {
  success: boolean;
  data?: Record<string, unknown>[];
  format?: "json" | "csv";
  error?: string;
}

/**
 * Configuration for data extraction.
 */
export interface DataExtractionConfig {
  /** Enable OCR for images (requires vision model) */
  enableOcr?: boolean;
  /** Preferred output format */
  outputFormat?: "json" | "csv";
}

/**
 * Create MCP tools for data extraction.
 * @param config - Configuration options that affect tool behavior
 */
export function createDataExtractionTools(config: DataExtractionConfig = {}): MCPTool[] {
  const { enableOcr = true, outputFormat = "json" } = config;

  const tools: MCPTool[] = [
    {
      name: "extract:table_from_pdf",
      description:
        "Extract tabular data from a PDF document. Returns structured data that can be converted to spreadsheet format.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to the PDF file",
          },
          pageNumbers: {
            type: "array",
            items: { type: "number" },
            description: "Specific pages to extract from (optional, defaults to all)",
          },
          tableHints: {
            type: "string",
            description: "Description of the table structure to help extraction",
          },
          outputFormat: {
            type: "string",
            enum: ["json", "csv"],
            description: "Output format for extracted data",
            default: outputFormat,
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "extract:receipts_to_csv",
      description:
        "Extract expense data from receipt images and compile into CSV format. Ideal for expense reporting.",
      inputSchema: {
        type: "object",
        properties: {
          imagePaths: {
            type: "array",
            items: { type: "string" },
            description: "Paths to receipt images",
          },
          outputPath: {
            type: "string",
            description: "Path for the output CSV file",
          },
          includeCategories: {
            type: "boolean",
            description: "Auto-categorize expenses",
            default: true,
          },
        },
        required: ["imagePaths", "outputPath"],
      },
    },
  ];

  // Only include OCR tool if enabled
  if (enableOcr) {
    tools.push({
      name: "extract:text_from_image",
      description:
        "Extract text from an image using OCR. Useful for receipts, screenshots, and scanned documents.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to the image file",
          },
          language: {
            type: "string",
            description: "Expected language of the text (e.g., 'en', 'zh')",
            default: "en",
          },
          extractStructure: {
            type: "boolean",
            description: "Whether to preserve document structure",
            default: false,
          },
        },
        required: ["filePath"],
      },
    });
  }

  return tools;
}

/**
 * Skill metadata for registration.
 */
export const dataExtractionSkill = {
  name: "data_extraction",
  description: "Extract structured data from PDFs, images, and documents",
  version: "1.0.0",
  createTools: createDataExtractionTools,
};
