/**
 * Web Browsing Skill
 *
 * Tools for intelligent web browsing and data gathering.
 * Part of Cowork's "Smart Browsing" capabilities.
 */

import type { MCPTool } from "../types";

/**
 * Configuration for web browsing skill.
 */
export interface WebBrowsingConfig {
  /** Maximum pages to visit in a single search */
  maxPages?: number;
  /** Timeout for page loads in milliseconds */
  timeoutMs?: number;
  /** User agent string */
  userAgent?: string;
}

/**
 * Create MCP tools for web browsing.
 * @param config - Configuration options that affect tool behavior
 */
export function createWebBrowsingTools(config: WebBrowsingConfig = {}): MCPTool[] {
  const { maxPages = 5, timeoutMs = 30000 } = config;

  return [
    {
      name: "browse:read_page",
      description:
        "Read and extract content from a web page. Returns the main text content in a structured format.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL of the page to read",
          },
          extractSelectors: {
            type: "array",
            items: { type: "string" },
            description: "CSS selectors to extract specific elements",
          },
          includeLinks: {
            type: "boolean",
            description: "Include links found on the page",
            default: false,
          },
          timeoutMs: {
            type: "number",
            description: "Timeout for page load in milliseconds",
            default: timeoutMs,
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browse:search_web",
      description:
        "Perform a web search and return summarized results. Useful for gathering information not available locally.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          numResults: {
            type: "number",
            description: "Number of results to return",
            default: maxPages,
          },
          site: {
            type: "string",
            description: "Limit search to a specific site (optional)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "browse:verify_company",
      description:
        "Look up and verify company information from public sources. Returns structured business data.",
      inputSchema: {
        type: "object",
        properties: {
          companyName: {
            type: "string",
            description: "Name of the company to verify",
          },
          includeFinancials: {
            type: "boolean",
            description: "Include available financial data",
            default: false,
          },
          includeContacts: {
            type: "boolean",
            description: "Include contact information",
            default: true,
          },
        },
        required: ["companyName"],
      },
    },
    {
      name: "browse:get_pricing",
      description: "Gather pricing information for a product or service from multiple sources.",
      inputSchema: {
        type: "object",
        properties: {
          productName: {
            type: "string",
            description: "Name of the product or service",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Specific websites to check (optional)",
          },
          currency: {
            type: "string",
            description: "Preferred currency for prices",
            default: "USD",
          },
        },
        required: ["productName"],
      },
    },
  ];
}

/**
 * Skill metadata for registration.
 */
export const webBrowsingSkill = {
  name: "web_browsing",
  description: "Intelligent web browsing and data gathering",
  version: "1.0.0",
  createTools: createWebBrowsingTools,
};
