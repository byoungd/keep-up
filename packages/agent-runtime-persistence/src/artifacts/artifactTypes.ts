/**
 * Artifact Types
 *
 * Shared types for artifact modules to avoid circular dependencies.
 */

import type { ArtifactEnvelope } from "@ku0/agent-runtime-core";

export interface ArtifactEmissionContext {
  correlationId?: string;
  source?: string;
  idempotencyKey?: string;
}

export interface ArtifactStoreResult {
  stored: boolean;
  valid: boolean;
  errors?: string[];
}

export interface ArtifactEmissionResult extends ArtifactStoreResult {
  artifactNodeId?: string;
}

/**
 * Interface for artifact emission (used by ImageArtifactStore).
 * This avoids importing the concrete ArtifactPipeline class.
 */
export interface ArtifactEmitter {
  emit(artifact: ArtifactEnvelope, context?: ArtifactEmissionContext): ArtifactEmissionResult;
}
