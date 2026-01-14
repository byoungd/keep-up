/**
 * Normalization Service
 *
 * Converts ingested content into canonical storage format (Loro CRDT).
 */

import {
  type BlockNode,
  LoroDoc,
  getMetaMap,
  nextBlockId,
  serializeAttrs,
  writeBlockTree,
} from "@keepup/lfcc-bridge";
import { type Token, type Tokens, lexer } from "marked";
import type { IngestResult } from "../types";
import type { ContentResult } from "./types";

export function normalizeIngestResult(result: IngestResult): ContentResult {
  // 1. Create Loro document
  const doc = new LoroDoc();

  // 2. Populate content as paragraph blocks
  const text = result.contentMarkdown ?? result.contentHtml ?? "";
  const blocks = contentToBlocks(doc, text);
  if (blocks.length === 0) {
    blocks.push({
      id: nextBlockId(doc),
      type: "paragraph",
      attrs: serializeAttrs({}),
      text: "",
      children: [],
    });
  }
  writeBlockTree(doc, blocks);

  // 3. Store metadata in the Loro meta map
  const metadata = getMetaMap(doc);
  if (result.author) {
    metadata.set("author", result.author);
  }
  if (result.publishedAt) {
    metadata.set("publishedAt", result.publishedAt);
  }
  if (result.canonicalUrl) {
    metadata.set("sourceUrl", result.canonicalUrl);
  }
  metadata.set("title", result.title);
  metadata.set("importedAt", Date.now());

  // 4. Encode state as snapshot bytes
  const crdtUpdate = doc.export({ mode: "snapshot" });

  // 5. Prepare text content for search (strip markdown/html tags ideally)
  // For this MVP, we just use the raw text
  const textContent = text;

  return {
    title: result.title,
    textContent,
    crdtUpdate,
    metadata: {
      author: result.author,
      publishedAt: result.publishedAt,
      sourceUrl: result.canonicalUrl,
      ...result.rawMetadata,
    },
  };
}

export class NormalizationService {
  /**
   * Normalize ingested content into a storage-ready result.
   */
  public normalize(result: IngestResult): ContentResult {
    return normalizeIngestResult(result);
  }
}

/**
 * Parse Markdown content into structured blocks using marked lexer.
 */
function contentToBlocks(doc: LoroDoc, content: string): BlockNode[] {
  const tokens = lexer(content);
  return tokensToBlocks(doc, tokens);
}

/**
 * Convert marked tokens to BlockNodes.
 */
function tokensToBlocks(doc: LoroDoc, tokens: Token[]): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const token of tokens) {
    // Lists need special handling - they expand to multiple blocks
    if (token.type === "list") {
      const listBlocks = listToBlocks(doc, token as Tokens.List);
      blocks.push(...listBlocks);
      continue;
    }

    const block = tokenToBlock(doc, token);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Convert a single marked token to a BlockNode.
 */
function tokenToBlock(doc: LoroDoc, token: Token): BlockNode | null {
  switch (token.type) {
    case "heading":
      return {
        id: nextBlockId(doc),
        type: "heading",
        attrs: serializeAttrs({ level: token.depth }),
        text: token.text,
        children: [],
      };

    case "paragraph":
      return {
        id: nextBlockId(doc),
        type: "paragraph",
        attrs: serializeAttrs({}),
        text: token.text,
        children: [],
      };

    case "code":
      return {
        id: nextBlockId(doc),
        type: "code",
        attrs: serializeAttrs({ language: token.lang || "" }),
        text: token.text,
        children: [],
      };

    case "blockquote":
      return {
        id: nextBlockId(doc),
        type: "quote",
        attrs: serializeAttrs({}),
        text: token.text,
        children: [],
      };

    case "hr":
      return {
        id: nextBlockId(doc),
        type: "horizontal_rule",
        attrs: serializeAttrs({}),
        text: "",
        children: [],
      };

    default:
      // For unsupported tokens, try to extract text
      if ("text" in token && typeof token.text === "string" && token.text.trim()) {
        return {
          id: nextBlockId(doc),
          type: "paragraph",
          attrs: serializeAttrs({}),
          text: token.text,
          children: [],
        };
      }
      return null;
  }
}

/**
 * Convert a list token to multiple paragraph blocks with list attributes.
 * Uses flat list architecture per CLAUDE.md spec.
 */
function listToBlocks(doc: LoroDoc, listToken: Tokens.List): BlockNode[] {
  const blocks: BlockNode[] = [];
  const listType = listToken.ordered ? "ordered" : "bullet";

  for (const item of listToken.items) {
    // Check if it's a task list item
    const isTask = item.task;
    const attrs = isTask
      ? { list_type: "task" as const, indent_level: 0, task_checked: item.checked ?? false }
      : { list_type: listType, indent_level: 0 };

    blocks.push({
      id: nextBlockId(doc),
      type: "paragraph",
      attrs: serializeAttrs(attrs),
      text: item.text,
      children: [],
    });
  }

  return blocks;
}
