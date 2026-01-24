/**
 * Tool Output Spooling
 *
 * Persists full tool outputs and returns truncated output for LLM context.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  DEFAULT_AGENT_SPOOL_DIR,
  DEFAULT_TOOL_OUTPUT_SPOOL_POLICY,
  type ToolContent,
  type ToolOutputSpoolCompression,
  type ToolOutputSpooler,
  type ToolOutputSpoolMetadata,
  type ToolOutputSpoolPolicy,
  type ToolOutputSpoolRecord,
  type ToolOutputSpoolRequest,
  type ToolOutputSpoolResult,
} from "../types";
import { stableJsonStringify } from "../utils/json";
import { compressPayloadZstd } from "../utils/tokenCounter";

export interface FileToolOutputSpoolerConfig {
  rootDir?: string;
  policy?: ToolOutputSpoolPolicy;
  compression?: ToolOutputSpoolerCompressionConfig;
}

export interface ToolOutputSpoolerCompressionConfig {
  enabled?: boolean;
  minBytes?: number;
  level?: number;
}

type ContentStats = {
  text: string;
  totalBytes: number;
  totalLines: number;
};

type TruncationResult = {
  text: string;
  bytes: number;
  lines: number;
  truncated: boolean;
};

type TruncationState = {
  bytes: number;
  lines: number;
};

type AppendOutcome = {
  appendedText?: string;
  bytes: number;
  lines: number;
  truncated: boolean;
};

const SPOOL_RECORD_VERSION = 1;
const DEFAULT_COMPRESSION_MIN_BYTES = 256 * 1024;
const DEFAULT_COMPRESSION_LEVEL = 3;
const DEFAULT_COMPRESSION_ENABLED = true;

export class FileToolOutputSpooler implements ToolOutputSpooler {
  private readonly rootDir: string;
  private readonly policy: ToolOutputSpoolPolicy;
  private readonly compression: Required<ToolOutputSpoolerCompressionConfig>;

  constructor(config: FileToolOutputSpoolerConfig = {}) {
    const rootDir = config.rootDir ?? DEFAULT_AGENT_SPOOL_DIR;
    this.rootDir = resolve(rootDir);
    this.policy = normalizePolicy(config.policy ?? DEFAULT_TOOL_OUTPUT_SPOOL_POLICY);
    this.compression = normalizeCompression(config.compression);
  }

  async spool(request: ToolOutputSpoolRequest): Promise<ToolOutputSpoolResult> {
    const policy = normalizePolicy(request.policy ?? this.policy);
    const stats = buildContentStats(request.content);
    const shouldSpool = stats.totalBytes > policy.maxBytes || stats.totalLines > policy.maxLines;

    if (!shouldSpool) {
      return {
        spooled: false,
        truncated: false,
        output: request.content,
      };
    }

    const spoolId = buildSpoolId(request);
    const spoolPath = this.resolveSpoolPath(request.toolName, spoolId);
    const truncation = truncateText(stats.text, policy);
    const outputBytes = truncation.bytes;
    const outputLines = truncation.lines;

    const metadata: ToolOutputSpoolMetadata = {
      spoolId,
      toolName: request.toolName,
      toolCallId: request.toolCallId,
      createdAt: Date.now(),
      uri: spoolPath,
      byteSize: stats.totalBytes,
      lineCount: stats.totalLines,
      truncatedBytes: Math.max(0, stats.totalBytes - outputBytes),
      truncatedLines: Math.max(0, stats.totalLines - outputLines),
      policy,
      contentHash: hashContent(request.content),
      stored: true,
    };

    const storedContent = await this.persistBinarySegments(
      request.toolName,
      spoolId,
      request.content
    );

    const record: ToolOutputSpoolRecord = {
      version: SPOOL_RECORD_VERSION,
      metadata,
      content: storedContent,
    };

    const compression = await this.maybeCompressRecord(record, spoolPath);
    if (compression) {
      record.compressed = compression;
    }

    try {
      await mkdir(dirname(spoolPath), { recursive: true });
      await writeFile(spoolPath, stableJsonStringify(record));
    } catch (error) {
      metadata.stored = false;
      metadata.error = error instanceof Error ? error.message : String(error);
    }

    const output: ToolContent[] = [];
    if (truncation.text) {
      output.push({ type: "text", text: truncation.text });
    }
    output.push({ type: "text", text: buildDisclosure(metadata) });
    if (metadata.stored) {
      output.push({ type: "resource", uri: metadata.uri, mimeType: "application/json" });
    }

    return {
      spooled: true,
      truncated: true,
      output,
      metadata,
    };
  }

  private resolveSpoolPath(toolName: string, spoolId: string): string {
    const safeTool = sanitizeSegment(toolName);
    return join(this.rootDir, safeTool, `${spoolId}.json`);
  }

  private async maybeCompressRecord(
    record: ToolOutputSpoolRecord,
    spoolPath: string
  ): Promise<ToolOutputSpoolCompression | undefined> {
    if (!this.compression.enabled || this.compression.minBytes <= 0) {
      return undefined;
    }

    const compressed = compressPayloadZstd(
      { metadata: record.metadata, content: record.content },
      this.compression.minBytes,
      this.compression.level
    );

    if (!compressed) {
      return undefined;
    }

    const compressedPath = spoolPath.replace(/\\.json$/, ".zst");
    try {
      await writeFile(compressedPath, Buffer.from(compressed.data));
    } catch {
      return undefined;
    }

    return {
      encoding: compressed.encoding,
      uri: compressedPath,
      originalBytes: compressed.originalBytes,
      compressedBytes: compressed.compressedBytes,
      compressionRatio: compressed.compressionRatio,
    };
  }

  private async persistBinarySegments(
    toolName: string,
    spoolId: string,
    content: ToolContent[]
  ): Promise<ToolContent[]> {
    const output: ToolContent[] = [];
    let index = 0;

    for (const segment of content) {
      if (segment.type !== "image") {
        output.push(segment);
        continue;
      }

      const decoded = decodeBase64(segment.data);
      if (!decoded) {
        output.push(segment);
        continue;
      }

      const extension = resolveImageExtension(segment.mimeType);
      const binaryPath = this.resolveBinaryPath(toolName, spoolId, index, extension);
      index += 1;

      try {
        await mkdir(dirname(binaryPath), { recursive: true });
        await writeFile(binaryPath, decoded);
        output.push({ type: "resource", uri: binaryPath, mimeType: segment.mimeType });
      } catch {
        output.push(segment);
      }
    }

    return output;
  }

  private resolveBinaryPath(
    toolName: string,
    spoolId: string,
    index: number,
    extension: string
  ): string {
    const safeTool = sanitizeSegment(toolName);
    const safeSpool = sanitizeSegment(spoolId);
    return join(this.rootDir, safeTool, safeSpool, `image_${index}.${extension}`);
  }
}

export function createFileToolOutputSpooler(
  config?: FileToolOutputSpoolerConfig
): FileToolOutputSpooler {
  return new FileToolOutputSpooler(config);
}

function buildSpoolId(request: ToolOutputSpoolRequest): string {
  const scope = {
    toolName: request.toolName,
    toolCallId: request.toolCallId,
    sessionId: request.context?.sessionId ?? "",
    correlationId: request.context?.correlationId ?? "",
    taskNodeId: request.context?.taskNodeId ?? "",
  };

  return createHash("sha256").update(stableJsonStringify(scope)).digest("hex");
}

function hashContent(content: ToolContent[]): string {
  return createHash("sha256").update(stableJsonStringify(content)).digest("hex");
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizePolicy(policy: ToolOutputSpoolPolicy): ToolOutputSpoolPolicy {
  const maxBytes = Number.isFinite(policy.maxBytes)
    ? Math.max(1, Math.floor(policy.maxBytes))
    : DEFAULT_TOOL_OUTPUT_SPOOL_POLICY.maxBytes;
  const maxLines = Number.isFinite(policy.maxLines)
    ? Math.max(1, Math.floor(policy.maxLines))
    : DEFAULT_TOOL_OUTPUT_SPOOL_POLICY.maxLines;

  return { maxBytes, maxLines };
}

function normalizeCompression(
  config: ToolOutputSpoolerCompressionConfig | undefined
): Required<ToolOutputSpoolerCompressionConfig> {
  if (!config) {
    return {
      enabled: DEFAULT_COMPRESSION_ENABLED,
      minBytes: DEFAULT_COMPRESSION_MIN_BYTES,
      level: DEFAULT_COMPRESSION_LEVEL,
    };
  }

  const enabled = config.enabled ?? DEFAULT_COMPRESSION_ENABLED;
  const minBytes = Number.isFinite(config.minBytes)
    ? Math.max(0, Math.floor(config.minBytes ?? DEFAULT_COMPRESSION_MIN_BYTES))
    : DEFAULT_COMPRESSION_MIN_BYTES;
  const level = Number.isFinite(config.level)
    ? Math.max(1, Math.floor(config.level ?? DEFAULT_COMPRESSION_LEVEL))
    : DEFAULT_COMPRESSION_LEVEL;

  return { enabled, minBytes, level };
}

function buildContentStats(content: ToolContent[]): ContentStats {
  const parts: string[] = [];
  let totalBytes = 0;

  for (const segment of content) {
    if (segment.type === "text") {
      parts.push(segment.text);
      totalBytes += Buffer.byteLength(segment.text);
    } else if (segment.type === "image") {
      const imageBytes = estimateImageBytes(segment.data);
      parts.push(`[image:${segment.mimeType};bytes=${imageBytes}]`);
      totalBytes += imageBytes;
    } else {
      parts.push(`[resource:${segment.uri}]`);
      totalBytes += Buffer.byteLength(segment.uri);
    }
  }

  const text = parts.join("\n");
  const totalLines = text ? text.split(/\r?\n/).length : 0;
  return { text, totalBytes, totalLines };
}

function truncateText(text: string, policy: ToolOutputSpoolPolicy): TruncationResult {
  if (!text) {
    return { text: "", bytes: 0, lines: 0, truncated: false };
  }

  const lines = text.split(/\r?\n/);
  const limits = {
    maxLines: Math.max(1, policy.maxLines),
    maxBytes: Math.max(1, policy.maxBytes),
  };
  const parts: string[] = [];
  let state: TruncationState = { bytes: 0, lines: 0 };
  let truncated = false;

  for (const line of lines) {
    const outcome = appendLineWithinLimits(line, state, limits);
    if (outcome.appendedText) {
      parts.push(outcome.appendedText);
    }
    state = { bytes: outcome.bytes, lines: outcome.lines };
    if (outcome.truncated) {
      truncated = true;
      break;
    }
  }

  return {
    text: parts.join(""),
    bytes: state.bytes,
    lines: state.lines,
    truncated: truncated || state.lines < lines.length,
  };
}

function appendLineWithinLimits(
  line: string,
  state: TruncationState,
  limits: { maxBytes: number; maxLines: number }
): AppendOutcome {
  if (state.lines >= limits.maxLines) {
    return { bytes: state.bytes, lines: state.lines, truncated: true };
  }

  const prefix = state.lines > 0 ? "\n" : "";
  const candidate = `${prefix}${line}`;
  const candidateBytes = Buffer.byteLength(candidate);
  if (state.bytes + candidateBytes <= limits.maxBytes) {
    return {
      appendedText: candidate,
      bytes: state.bytes + candidateBytes,
      lines: state.lines + 1,
      truncated: false,
    };
  }

  const remaining = limits.maxBytes - state.bytes;
  if (remaining <= 0) {
    return { bytes: state.bytes, lines: state.lines, truncated: true };
  }

  const slice = sliceByBytes(candidate, remaining);
  if (!slice) {
    return { bytes: state.bytes, lines: state.lines, truncated: true };
  }

  return {
    appendedText: slice,
    bytes: state.bytes + Buffer.byteLength(slice),
    lines: state.lines + 1,
    truncated: true,
  };
}

function sliceByBytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return buffer.subarray(0, maxBytes).toString("utf8");
}

function buildDisclosure(metadata: ToolOutputSpoolMetadata): string {
  const policy = metadata.policy;
  if (metadata.stored) {
    return `[Tool output truncated to ${policy.maxBytes} bytes / ${policy.maxLines} lines. Full output saved to ${metadata.uri}.]`;
  }
  const error = metadata.error ?? "spool write failed";
  return `[Tool output truncated to ${policy.maxBytes} bytes / ${policy.maxLines} lines. Full output not persisted (${error}).]`;
}

function resolveImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function decodeBase64(data: string): Buffer | null {
  try {
    return Buffer.from(data, "base64");
  } catch {
    return null;
  }
}

function estimateImageBytes(data: string): number {
  const decoded = decodeBase64(data);
  if (decoded) {
    return decoded.byteLength;
  }
  return Buffer.byteLength(data);
}
