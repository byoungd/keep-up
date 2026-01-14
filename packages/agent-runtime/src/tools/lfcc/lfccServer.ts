/**
 * LFCC Tool Server
 *
 * Provides document operations through the LFCC (Local-First Collaboration Contract).
 * This bridges the agent runtime with the document editing system.
 *
 * Design: Uses dependency injection for the LFCC bridge to maintain loose coupling.
 */

import type { ContentChunk, DataAccessPolicy } from "@ku0/core";
import { applyDataAccessPolicyToChunks } from "@ku0/core";
import type { MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// LFCC Bridge Interface (dependency injection)
// ============================================================================

/**
 * Interface for LFCC bridge operations.
 * Implement this to connect to your actual LFCC implementation.
 */
export interface ILFCCBridge {
  // Document operations
  getDocument(docId: string): Promise<LFCCDocument | null>;
  listDocuments(options?: ListDocumentsOptions): Promise<LFCCDocumentMeta[]>;
  createDocument(title: string, content?: string): Promise<LFCCDocument>;

  // Content operations
  getContent(docId: string): Promise<string>;
  getBlocks(docId: string): Promise<LFCCBlock[]>;
  getBlock(docId: string, blockId: string): Promise<LFCCBlock | null>;

  // Editing operations (returns operation for CRDT)
  insertBlock(
    docId: string,
    afterBlockId: string | null,
    content: string,
    type?: BlockType
  ): Promise<LFCCOperation>;
  updateBlock(docId: string, blockId: string, content: string): Promise<LFCCOperation>;
  deleteBlock(docId: string, blockId: string): Promise<LFCCOperation>;
  moveBlock(docId: string, blockId: string, afterBlockId: string | null): Promise<LFCCOperation>;

  // Search
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Apply operations (commit to CRDT)
  applyOperations(docId: string, operations: LFCCOperation[]): Promise<void>;
}

// ============================================================================
// LFCC Types
// ============================================================================

export interface LFCCDocument {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  blockCount: number;
  wordCount: number;
}

export interface LFCCDocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface LFCCBlock {
  id: string;
  type: BlockType;
  content: string;
  children?: LFCCBlock[];
  attributes?: Record<string, unknown>;
}

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet_list"
  | "numbered_list"
  | "quote"
  | "code"
  | "divider";

export interface LFCCOperation {
  type: "insert" | "update" | "delete" | "move";
  blockId?: string;
  content?: string;
  position?: { afterBlockId: string | null };
  blockType?: BlockType;
  timestamp: number;
}

export interface ListDocumentsOptions {
  limit?: number;
  offset?: number;
  sortBy?: "title" | "updatedAt" | "createdAt";
  order?: "asc" | "desc";
}

export interface SearchOptions {
  docIds?: string[];
  limit?: number;
  semantic?: boolean;
}

export interface SearchResult {
  docId: string;
  docTitle: string;
  blockId: string;
  content: string;
  score: number;
  highlights?: string[];
}

function collectContentChunks(blocks: LFCCBlock[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];

  const walk = (blockList: LFCCBlock[]): void => {
    for (const block of blockList) {
      chunks.push({ block_id: block.id, content: block.content, relevance: 1 });
      if (block.children && block.children.length > 0) {
        walk(block.children);
      }
    }
  };

  walk(blocks);
  return chunks;
}

function filterBlocksByPolicy(blocks: LFCCBlock[], contentMap: Map<string, string>): LFCCBlock[] {
  const filtered: LFCCBlock[] = [];

  for (const block of blocks) {
    const children = block.children ? filterBlocksByPolicy(block.children, contentMap) : undefined;
    const content = contentMap.get(block.id);
    const hasChildren = children !== undefined && children.length > 0;

    if (content === undefined && !hasChildren) {
      continue;
    }

    filtered.push({
      ...block,
      content: content ?? "",
      children: hasChildren ? children : undefined,
    });
  }

  return filtered;
}

function applyDataAccessPolicyToBlocks(
  blocks: LFCCBlock[],
  policy?: DataAccessPolicy
): { content: string; blocks: LFCCBlock[] } {
  const effectivePolicy: DataAccessPolicy = policy ?? {
    max_context_chars: 8000,
    redaction_strategy: "mask",
    pii_handling: "mask",
  };
  const chunks = collectContentChunks(blocks);
  const filteredChunks = applyDataAccessPolicyToChunks(chunks, effectivePolicy);
  if (filteredChunks.length !== chunks.length) {
    const keptIds = new Set(filteredChunks.map((chunk) => chunk.block_id));
    const omitted = chunks.filter((chunk) => !keptIds.has(chunk.block_id)).map((c) => c.block_id);
    if (omitted.length > 0) {
      console.info("[LFCC][data-access] Omitted blocks from context", {
        omitted,
        total: chunks.length,
        kept: filteredChunks.length,
      });
    }
  }
  const contentMap = new Map(filteredChunks.map((chunk) => [chunk.block_id, chunk.content]));
  const content = filteredChunks.map((chunk) => chunk.content).join("\n\n");
  const filteredBlocks = filterBlocksByPolicy(blocks, contentMap);

  return { content, blocks: filteredBlocks };
}

function applyPolicyToSearchResults(
  results: SearchResult[],
  policy?: DataAccessPolicy
): SearchResult[] {
  const effectivePolicy: DataAccessPolicy = policy ?? {
    max_context_chars: 8000,
    redaction_strategy: "mask",
    pii_handling: "mask",
  };
  const chunks: ContentChunk[] = results.map((result) => ({
    block_id: result.blockId,
    content: result.content,
    relevance: result.score,
  }));
  const filteredChunks = applyDataAccessPolicyToChunks(chunks, effectivePolicy);
  const contentMap = new Map(filteredChunks.map((chunk) => [chunk.block_id, chunk.content]));

  return results
    .filter((result) => contentMap.has(result.blockId))
    .map((result) => ({
      ...result,
      content: contentMap.get(result.blockId) ?? "",
    }));
}

// ============================================================================
// Mock LFCC Bridge (for testing/development)
// ============================================================================

/**
 * Mock implementation for testing.
 * Replace with actual LFCC bridge in production.
 */
export class MockLFCCBridge implements ILFCCBridge {
  private documents = new Map<string, { doc: LFCCDocument; blocks: LFCCBlock[] }>();

  async getDocument(docId: string): Promise<LFCCDocument | null> {
    return this.documents.get(docId)?.doc ?? null;
  }

  async listDocuments(_options?: ListDocumentsOptions): Promise<LFCCDocumentMeta[]> {
    return Array.from(this.documents.values()).map(({ doc }) => ({
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updatedAt,
    }));
  }

  async createDocument(title: string, content?: string): Promise<LFCCDocument> {
    const id = `doc_${Date.now()}`;
    const doc: LFCCDocument = {
      id,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blockCount: content ? 1 : 0,
      wordCount: content?.split(/\s+/).length ?? 0,
    };
    const blocks: LFCCBlock[] = content
      ? [{ id: `block_${Date.now()}`, type: "paragraph", content }]
      : [];
    this.documents.set(id, { doc, blocks });
    return doc;
  }

  async getContent(docId: string): Promise<string> {
    const entry = this.documents.get(docId);
    if (!entry) {
      return "";
    }
    return entry.blocks.map((b) => b.content).join("\n\n");
  }

  async getBlocks(docId: string): Promise<LFCCBlock[]> {
    return this.documents.get(docId)?.blocks ?? [];
  }

  async getBlock(docId: string, blockId: string): Promise<LFCCBlock | null> {
    const blocks = await this.getBlocks(docId);
    return blocks.find((b) => b.id === blockId) ?? null;
  }

  async insertBlock(
    docId: string,
    afterBlockId: string | null,
    content: string,
    type: BlockType = "paragraph"
  ): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const newBlock: LFCCBlock = {
      id: `block_${Date.now()}`,
      type,
      content,
    };

    if (afterBlockId === null) {
      entry.blocks.unshift(newBlock);
    } else {
      const index = entry.blocks.findIndex((b) => b.id === afterBlockId);
      if (index >= 0) {
        entry.blocks.splice(index + 1, 0, newBlock);
      } else {
        entry.blocks.push(newBlock);
      }
    }

    entry.doc.updatedAt = Date.now();
    entry.doc.blockCount = entry.blocks.length;

    return {
      type: "insert",
      blockId: newBlock.id,
      content,
      blockType: type,
      position: { afterBlockId },
      timestamp: Date.now(),
    };
  }

  async updateBlock(docId: string, blockId: string, content: string): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const block = entry.blocks.find((b) => b.id === blockId);
    if (!block) {
      throw new Error(`Block not found: ${blockId}`);
    }

    block.content = content;
    entry.doc.updatedAt = Date.now();

    return {
      type: "update",
      blockId,
      content,
      timestamp: Date.now(),
    };
  }

  async deleteBlock(docId: string, blockId: string): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = entry.blocks.findIndex((b) => b.id === blockId);
    if (index >= 0) {
      entry.blocks.splice(index, 1);
      entry.doc.blockCount = entry.blocks.length;
      entry.doc.updatedAt = Date.now();
    }

    return {
      type: "delete",
      blockId,
      timestamp: Date.now(),
    };
  }

  async moveBlock(
    docId: string,
    blockId: string,
    afterBlockId: string | null
  ): Promise<LFCCOperation> {
    const entry = this.documents.get(docId);
    if (!entry) {
      throw new Error(`Document not found: ${docId}`);
    }

    const blockIndex = entry.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const [block] = entry.blocks.splice(blockIndex, 1);

    if (afterBlockId === null) {
      entry.blocks.unshift(block);
    } else {
      const targetIndex = entry.blocks.findIndex((b) => b.id === afterBlockId);
      if (targetIndex >= 0) {
        entry.blocks.splice(targetIndex + 1, 0, block);
      } else {
        entry.blocks.push(block);
      }
    }

    entry.doc.updatedAt = Date.now();

    return {
      type: "move",
      blockId,
      position: { afterBlockId },
      timestamp: Date.now(),
    };
  }

  async search(query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [, entry] of this.documents) {
      for (const block of entry.blocks) {
        if (block.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            docId: entry.doc.id,
            docTitle: entry.doc.title,
            blockId: block.id,
            content: block.content,
            score: 1.0,
          });
        }
      }
    }

    return results;
  }

  async applyOperations(_docId: string, _operations: LFCCOperation[]): Promise<void> {
    // Mock: operations are already applied in individual methods
  }
}

// ============================================================================
// LFCC Tool Server
// ============================================================================

export class LFCCToolServer extends BaseToolServer {
  readonly name = "lfcc";
  readonly description = "Document operations through LFCC (Local-First Collaboration Contract)";

  private readonly bridge: ILFCCBridge;

  constructor(bridge?: ILFCCBridge) {
    super();
    this.bridge = bridge ?? new MockLFCCBridge();

    this.registerTools();
  }

  private registerTools(): void {
    // List documents
    this.registerTool(
      {
        name: "list_documents",
        description: "List available documents",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of documents to return" },
            sortBy: { type: "string", enum: ["title", "updatedAt", "createdAt"] },
          },
        },
        annotations: { category: "knowledge", readOnly: true, estimatedDuration: "fast" },
      },
      this.handleListDocuments.bind(this)
    );

    // Get document
    this.registerTool(
      {
        name: "get_document",
        description: "Get a document by ID",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
          },
          required: ["docId"],
        },
        annotations: { category: "knowledge", readOnly: true, estimatedDuration: "fast" },
      },
      this.handleGetDocument.bind(this)
    );

    // Read content
    this.registerTool(
      {
        name: "read_content",
        description: "Read the full content of a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
          },
          required: ["docId"],
        },
        annotations: { category: "knowledge", readOnly: true, estimatedDuration: "fast" },
      },
      this.handleReadContent.bind(this)
    );

    // Get blocks
    this.registerTool(
      {
        name: "get_blocks",
        description: "Get all blocks in a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
          },
          required: ["docId"],
        },
        annotations: { category: "knowledge", readOnly: true, estimatedDuration: "fast" },
      },
      this.handleGetBlocks.bind(this)
    );

    // Insert block
    this.registerTool(
      {
        name: "insert_block",
        description: "Insert a new block into a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
            afterBlockId: {
              type: "string",
              description: "Insert after this block (null for beginning)",
            },
            content: { type: "string", description: "Block content" },
            type: {
              type: "string",
              description: "Block type",
              enum: [
                "paragraph",
                "heading1",
                "heading2",
                "heading3",
                "bullet_list",
                "numbered_list",
                "quote",
                "code",
              ],
            },
          },
          required: ["docId", "content"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleInsertBlock.bind(this)
    );

    // Update block
    this.registerTool(
      {
        name: "update_block",
        description: "Update an existing block",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
            blockId: { type: "string", description: "Block ID to update" },
            content: { type: "string", description: "New content" },
          },
          required: ["docId", "blockId", "content"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleUpdateBlock.bind(this)
    );

    // Delete block
    this.registerTool(
      {
        name: "delete_block",
        description: "Delete a block from a document",
        inputSchema: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document ID" },
            blockId: { type: "string", description: "Block ID to delete" },
          },
          required: ["docId", "blockId"],
        },
        annotations: {
          category: "knowledge",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleDeleteBlock.bind(this)
    );

    // Search
    this.registerTool(
      {
        name: "search",
        description: "Search across documents",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Maximum results" },
            semantic: { type: "boolean", description: "Use semantic search" },
          },
          required: ["query"],
        },
        annotations: { category: "knowledge", readOnly: true, estimatedDuration: "medium" },
      },
      this.handleSearch.bind(this)
    );
  }

  // Handler implementations

  private async handleListDocuments(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docs = await this.bridge.listDocuments({
      limit: args.limit as number,
      sortBy: args.sortBy as "title" | "updatedAt" | "createdAt",
    });

    const formatted = docs.map((d) => `- ${d.title} (${d.id})`).join("\n");
    return textResult(`Documents:\n${formatted || "(no documents)"}`);
  }

  private async handleGetDocument(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docId = args.docId as string;
    const doc = await this.bridge.getDocument(docId);

    if (!doc) {
      return errorResult("RESOURCE_NOT_FOUND", `Document not found: ${docId}`);
    }

    return textResult(
      `Document: ${doc.title}\nID: ${doc.id}\nBlocks: ${doc.blockCount}\nWords: ${doc.wordCount}\nUpdated: ${new Date(doc.updatedAt).toISOString()}`
    );
  }

  private async handleReadContent(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docId = args.docId as string;
    const dataAccessPolicy = context.security.dataAccessPolicy;
    if (dataAccessPolicy) {
      const blocks = await this.bridge.getBlocks(docId);
      const { content } = applyDataAccessPolicyToBlocks(blocks, dataAccessPolicy);
      return textResult(content || "(empty document)");
    }

    const content = await this.bridge.getContent(docId);
    return textResult(content || "(empty document)");
  }

  private async handleGetBlocks(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const docId = args.docId as string;
    const blocks = await this.bridge.getBlocks(docId);
    const dataAccessPolicy = context.security.dataAccessPolicy;
    const filteredBlocks = dataAccessPolicy
      ? applyDataAccessPolicyToBlocks(blocks, dataAccessPolicy).blocks
      : blocks;

    const formatted = filteredBlocks
      .map(
        (b) =>
          `[${b.id}] (${b.type}) ${b.content.slice(0, 100)}${b.content.length > 100 ? "..." : ""}`
      )
      .join("\n");

    return textResult(`Blocks:\n${formatted || "(no blocks)"}`);
  }

  private async handleInsertBlock(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const docId = args.docId as string;
    const afterBlockId = (args.afterBlockId as string) ?? null;
    const content = args.content as string;
    const type = (args.type as BlockType) ?? "paragraph";

    const op = await this.bridge.insertBlock(docId, afterBlockId, content, type);

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:insert_block",
      action: "result",
      userId: context.userId,
      input: { docId, blockId: op.blockId },
      sandboxed: false,
    });

    return textResult(`Inserted block: ${op.blockId}`);
  }

  private async handleUpdateBlock(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const docId = args.docId as string;
    const blockId = args.blockId as string;
    const content = args.content as string;

    await this.bridge.updateBlock(docId, blockId, content);

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:update_block",
      action: "result",
      userId: context.userId,
      input: { docId, blockId },
      sandboxed: false,
    });

    return textResult(`Updated block: ${blockId}`);
  }

  private async handleDeleteBlock(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (
      context.security.permissions.lfcc !== "write" &&
      context.security.permissions.lfcc !== "admin"
    ) {
      return errorResult("PERMISSION_DENIED", "Document write access is disabled");
    }

    const docId = args.docId as string;
    const blockId = args.blockId as string;

    await this.bridge.deleteBlock(docId, blockId);

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "lfcc:delete_block",
      action: "result",
      userId: context.userId,
      input: { docId, blockId },
      sandboxed: false,
    });

    return textResult(`Deleted block: ${blockId}`);
  }

  private async handleSearch(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (context.security.permissions.lfcc === "none") {
      return errorResult("PERMISSION_DENIED", "Document access is disabled");
    }

    const query = args.query as string;
    const limit = args.limit as number | undefined;
    const semantic = args.semantic as boolean | undefined;

    const results = await this.bridge.search(query, { limit, semantic });
    const dataAccessPolicy = context.security.dataAccessPolicy;
    const filteredResults = dataAccessPolicy
      ? applyPolicyToSearchResults(results, dataAccessPolicy)
      : results;

    if (filteredResults.length === 0) {
      return textResult("No results found");
    }

    const formatted = filteredResults
      .map((r) => `- [${r.docTitle}] ${r.content.slice(0, 100)}...`)
      .join("\n");

    return textResult(`Search results for "${query}":\n${formatted}`);
  }
}

/**
 * Create an LFCC tool server with the provided bridge.
 */
export function createLFCCToolServer(bridge?: ILFCCBridge): LFCCToolServer {
  return new LFCCToolServer(bridge);
}
