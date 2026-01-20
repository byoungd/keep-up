/**
 * Image Artifact Storage
 *
 * Stores image payloads on disk and emits artifact envelopes for retrieval.
 */

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { ArtifactEnvelope, ToolContent, ToolContext, ToolOutputSpoolMetadata } from "../types";
import { DEFAULT_AGENT_SPOOL_DIR } from "../types";
import type { ArtifactEmissionContext, ArtifactEmitter } from "./artifactTypes";

export interface ImageArtifactPolicy {
  maxBytes: number;
  allowedMimeTypes: string[];
}

export const DEFAULT_IMAGE_ARTIFACT_POLICY: ImageArtifactPolicy = {
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
};

export interface ImageArtifactStoreOptions {
  pipeline: ArtifactEmitter;
  rootDir?: string;
  policy?: ImageArtifactPolicy;
}

export interface ImageArtifactInput {
  data: string;
  mimeType: string;
  title?: string;
  sourceTool?: string;
  context?: ArtifactEmissionContext;
  taskNodeId?: string;
  toolOutputSpool?: ToolOutputSpoolMetadata;
  toolContext?: ToolContext;
}

export interface ImageArtifactStoreResult {
  stored: boolean;
  resource?: ToolContent;
  artifact?: ArtifactEnvelope;
  byteSize: number;
  error?: string;
  skippedReason?: string;
}

export class ImageArtifactStore {
  private readonly pipeline: ArtifactEmitter;
  private readonly rootDir: string;
  private readonly policy: ImageArtifactPolicy;

  constructor(options: ImageArtifactStoreOptions) {
    this.pipeline = options.pipeline;
    this.rootDir = resolve(options.rootDir ?? join(DEFAULT_AGENT_SPOOL_DIR, "images"));
    this.policy = normalizePolicy(options.policy ?? DEFAULT_IMAGE_ARTIFACT_POLICY);
  }

  async store(input: ImageArtifactInput): Promise<ImageArtifactStoreResult> {
    if (!this.policy.allowedMimeTypes.includes(input.mimeType)) {
      return {
        stored: false,
        byteSize: 0,
        skippedReason: `Unsupported mime type: ${input.mimeType}`,
      };
    }

    const decoded = decodeBase64(input.data);
    if (!decoded) {
      return {
        stored: false,
        byteSize: 0,
        error: "Invalid base64 image data",
      };
    }

    const byteSize = decoded.byteLength;
    if (byteSize > this.policy.maxBytes) {
      return {
        stored: false,
        byteSize,
        skippedReason: `Image exceeds max size (${byteSize} > ${this.policy.maxBytes} bytes)`,
      };
    }

    const contentHash = createHash("sha256").update(decoded).digest("hex");
    const extension = resolveExtension(input.mimeType);
    const filename = `${contentHash}.${extension}`;
    const filePath = join(this.rootDir, filename);

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, decoded);
    } catch (error) {
      return {
        stored: false,
        byteSize,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const artifact: ArtifactEnvelope = {
      id: `image_${contentHash}`,
      type: "ImageArtifact",
      schemaVersion: "1.0.0",
      title: input.title ?? "Image artifact",
      payload: {
        uri: filePath,
        mimeType: input.mimeType,
        byteSize,
        contentHash,
        sourceTool: input.sourceTool,
        toolOutputSpoolId: input.toolOutputSpool?.spoolId,
      },
      taskNodeId: input.taskNodeId ?? "tool-output",
      createdAt: new Date().toISOString(),
      renderHints: {
        kind: "image",
      },
    };

    const emissionContext = input.context;
    const result = this.pipeline.emit(artifact, emissionContext);
    if (!result.stored) {
      await rm(filePath, { force: true }).catch(() => undefined);
      return {
        stored: false,
        byteSize,
        error: result.errors?.[0] ?? "Artifact pipeline rejected image",
      };
    }

    return {
      stored: true,
      byteSize,
      artifact,
      resource: { type: "resource", uri: filePath, mimeType: input.mimeType },
    };
  }
}

export function createImageArtifactStore(options: ImageArtifactStoreOptions): ImageArtifactStore {
  return new ImageArtifactStore(options);
}

function resolveExtension(mimeType: string): string {
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

function normalizePolicy(policy: ImageArtifactPolicy): ImageArtifactPolicy {
  const maxBytes = Number.isFinite(policy.maxBytes)
    ? Math.max(1, Math.floor(policy.maxBytes))
    : DEFAULT_IMAGE_ARTIFACT_POLICY.maxBytes;
  const allowedMimeTypes =
    policy.allowedMimeTypes.length > 0
      ? [...policy.allowedMimeTypes]
      : [...DEFAULT_IMAGE_ARTIFACT_POLICY.allowedMimeTypes];
  return { maxBytes, allowedMimeTypes };
}
